/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React from 'react';
import { Page, PageSection, PageSectionVariants } from "@patternfly/react-core/dist/esm/components/Page";
import { Alert, AlertActionCloseButton, AlertActionLink, AlertGroup } from "@patternfly/react-core/dist/esm/components/Alert";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { EmptyState, EmptyStateHeader, EmptyStateFooter, EmptyStateIcon, EmptyStateActions, EmptyStateVariant } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Stack } from "@patternfly/react-core/dist/esm/layouts/Stack";
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { WithDialogs } from "dialogs.jsx";

import cockpit from 'cockpit';
import { superuser } from "superuser";
import ContainerHeader from './ContainerHeader.jsx';
import Containers from './Containers.jsx';
import Images from './Images.jsx';
import * as client from './client.js';
import { WithDockerInfo } from './util.js';

const _ = cockpit.gettext;

class Application extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            serviceAvailable: null,
            enableService: true,
            images: null,
            imagesLoaded: false,
            containers: null,
            containersFilter: "all",
            containersStats: {},
            containersLoaded: null,
            textFilter: "",
            ownerFilter: "all",
            dropDownValue: 'Everything',
            notifications: [],
            showStartService: true,
            version: '1.3.0',
            selinuxAvailable: false,
            dockerRestartAvailable: false,
            currentUser: _("User"),
            privileged: false,
            hasDockerGroup: false,
            location: {},
        };
        this.onAddNotification = this.onAddNotification.bind(this);
        this.onDismissNotification = this.onDismissNotification.bind(this);
        this.onFilterChanged = this.onFilterChanged.bind(this);
        this.onContainerFilterChanged = this.onContainerFilterChanged.bind(this);
        this.updateContainer = this.updateContainer.bind(this);
        this.startService = this.startService.bind(this);
        this.goToServicePage = this.goToServicePage.bind(this);
        this.onNavigate = this.onNavigate.bind(this);

        this.pendingUpdateContainer = {}; // id → promise
    }

    onAddNotification(notification) {
        notification.index = this.state.notifications.length;

        this.setState(prevState => ({
            notifications: [
                ...prevState.notifications,
                notification
            ]
        }));
    }

    onDismissNotification(notificationIndex) {
        const notificationsArray = this.state.notifications.concat();
        const index = notificationsArray.findIndex(current => current.index == notificationIndex);

        if (index !== -1) {
            notificationsArray.splice(index, 1);
            this.setState({ notifications: notificationsArray });
        }
    }

    updateUrl(options) {
        cockpit.location.go([], options);
    }

    onFilterChanged(value) {
        this.setState({
            textFilter: value
        });

        const options = this.state.location;
        if (value === "") {
            delete options.name;
            this.updateUrl(Object.assign(options));
        } else {
            this.updateUrl(Object.assign(this.state.location, { name: value }));
        }
    }

    onContainerFilterChanged(value) {
        this.setState({
            containersFilter: value
        });

        const options = this.state.location;
        if (value == "running") {
            delete options.container;
            this.updateUrl(Object.assign(options));
        } else {
            this.updateUrl(Object.assign(options, { container: value }));
        }
    }

    updateState(state, id, newValue) {
        this.setState(prevState => {
            return {
                [state]: { ...prevState[state], [id]: newValue }
            };
        });
    }

    updateContainerStats(id) {
        client.streamContainerStats(id, reply => {
            if (reply.Error != null) // executed when container stop
                console.warn("Failed to update container stats:", JSON.stringify(reply.message));
            else {
                this.updateState("containersStats", id, reply);
            }
        }).catch(ex => {
            if (ex.cause == "no support for CGroups V1 in rootless environments" || ex.cause == "Container stats resource only available for cgroup v2") {
                console.log("This OS does not support CgroupsV2. Some information may be missing.");
            } else
                console.warn("Failed to update container stats:", JSON.stringify(ex.message));
        });
    }

    initContainers() {
        return client.getContainers()
                .then(containerList => Promise.all(
                    containerList.map(container => client.inspectContainer(container.Id))
                ))
                .then(containerDetails => {
                    this.setState(prevState => {
                        const copyContainers = prevState.containers || {};
                        for (const detail of containerDetails) {
                            copyContainers[detail.Id] = detail;
                            this.updateContainerStats(detail.Id);
                        }

                        return {
                            containers: copyContainers,
                            containersLoaded: true,
                        };
                    });
                })
                .catch(console.log);
    }

    updateImages() {
        client.getImages()
                .then(reply => {
                    this.setState(prevState => {
                        return {
                            images: reply,
                            imagesLoaded: true
                        };
                    });
                })
                .catch(ex => {
                    console.warn("Failed to do Update Images:", JSON.stringify(ex));
                });
    }

    updateContainer(id, event) {
        /* when firing off multiple calls in parallel, docker can return them in a random order.
         * This messes up the state. So we need to serialize them for a particular container. */
        const idx = id;
        const wait = this.pendingUpdateContainer[idx] ?? Promise.resolve();

        const new_wait = wait.then(() => client.inspectContainer(id))
                .then(details => {
                    // HACK: during restart State never changes from "running"
                    //       override it to reconnect console after restart
                    if (event?.Action === "restart")
                        details.State.Status = "restarting";
                    this.updateState("containers", idx, details);
                })
                .catch(console.log);
        this.pendingUpdateContainer[idx] = new_wait;
        new_wait.finally(() => { delete this.pendingUpdateContainer[idx] });

        return new_wait;
    }

    updateImage(id) {
        client.getImages(id)
                .then(reply => {
                    const image = reply[id];
                    this.updateState("images", id, image);
                })
                .catch(ex => {
                    console.warn("Failed to do Update Image:", JSON.stringify(ex));
                });
    }

    // see https://docs.podman.io/en/latest/markdown/podman-events.1.html

    handleImageEvent(event) {
        switch (event.Action) {
        case 'push':
        case 'save':
        case 'tag':
            this.updateImage(event.Actor.ID);
            break;
        case 'pull': // Pull event has not event.id
        case 'untag':
        case 'import':
        case 'prune':
        case 'load':
            this.updateImages();
            break;
        case 'delete':
            this.setState(prevState => {
                const images = { ...prevState.images };
                delete images[event.Actor.ID];

                return { images };
            });
            break;
        default:
            console.warn('Unhandled event type ', event.Type, event.Action);
        }
    }

    handleContainerEvent(event) {
        if (event.Action.includes(':'))
            event.Action = event.Action.split(':')[0];
        const id = event.Actor.ID;

        switch (event.Action) {
        /* The following events do not need to trigger any state updates */
        case 'attach':
        case 'resize':
        case 'kill':
        case 'prune':
        case 'restart':
            break;
        /* The following events need only to update the Container list
         * We do get the container affected in the event object, but for
         * now we'll do a batch update
         */
        case 'exec_start':
        case 'start':
            this.updateContainer(id, event);
            break;
        case 'exec_create':
        case 'create':
        case 'die':
        case 'exec_die':
        case 'health_status':
        case 'pause':
        case 'stop':
        case 'unpause':
        case 'rename': // rename event is available starting podman v4.1; until then the container does not get refreshed after renaming
            this.updateContainer(id, event);
            break;

        case 'destroy':
            this.setState(prevState => {
                const containers = { ...prevState.containers };
                delete containers[id];

                return { containers };
            });
            break;

        // only needs to update the Image list, this ought to be an image event
        case 'commit':
            this.updateImages();
            break;
        default:
            console.warn('Unhandled event type ', event.Type, event.Action);
        }
    }

    handleEvent(event) {
        switch (event.Type) {
        case 'container':
            this.handleContainerEvent(event);
            break;
        case 'image':
            this.handleImageEvent(event);
            break;
        default:
            console.warn('Unhandled event type ', event.Type);
        }
    }

    cleanupAfterService(key) {
        ["images", "containers"].forEach(t => {
            if (this.state[t])
                this.setState(prevState => {
                    const copy = {};
                    Object.entries(prevState[t] || {}).forEach(([id, v]) => {
                        copy[id] = v;
                    });
                    return { [t]: copy };
                });
        });
    }

    init() {
        client.getInfo()
                .then(reply => {
                    this.setState({
                        serviceAvailable: true,
                        version: reply.ServerVersion,
                        registries: reply.RegistryConfig.IndexConfigs,
                        cgroupVersion: reply.CgroupVersion,
                    });
                    this.updateImages();
                    this.initContainers();
                    client.streamEvents(message => this.handleEvent(message))
                            .then(() => {
                                this.setState({ serviceAvailable: false });
                                this.cleanupAfterService();
                            })
                            .catch(e => {
                                console.log(e);
                                this.setState({ serviceAvailable: false });
                                this.cleanupAfterService();
                            });

                    // Listen if docker is still running
                    const ch = cockpit.channel({ payload: "stream", unix: client.getAddress() });
                    ch.addEventListener("close", () => {
                        this.setState({ serviceAvailable: false });
                        this.cleanupAfterService();
                    });

                    ch.send("GET " + client.VERSION + "/events HTTP/1.0\r\nContent-Length: 0\r\n\r\n");
                })
                .catch((r) => {
                    console.log("Failed to get info from docker", r);
                    this.setState({
                        serviceAvailable: false,
                        containersLoaded: true,
                        imagesLoaded: true
                    });
                });
    }

    componentDidMount() {
        cockpit.script("[ `id -u` -eq 0 ] || [ `id -nG | grep -qw docker; echo $?` -eq 0 ]; echo $?")
                .done(result => {
                    const hasDockerGroup = result.trim() === "0";
                    this.setState({ hasDockerGroup });
                    if (hasDockerGroup) {
                        this.init();
                    }
                })
                .catch(e => console.log("Could not determine if user has docker group: ", e.message));
        cockpit.spawn("selinuxenabled", { error: "ignore" })
                .then(() => this.setState({ selinuxAvailable: true }))
                .catch(() => this.setState({ selinuxAvailable: false }));

        cockpit.spawn(["systemctl", "show", "--value", "-p", "LoadState", "docker"], { environ: ["LC_ALL=C"], error: "ignore" })
                .then(out => this.setState({ dockerRestartAvailable: out.trim() === "loaded" }));

        superuser.addEventListener("changed", () => this.setState({ privileged: !!superuser.allowed }));
        this.setState({ privileged: superuser.allowed });

        cockpit.addEventListener("locationchanged", this.onNavigate);
        this.onNavigate();
    }

    componentWillUnmount() {
        cockpit.removeEventListener("locationchanged", this.onNavigate);
    }

    onNavigate() {
        // HACK: Use usePageLocation when this is rewritten into a functional component
        const { options, path } = cockpit.location;
        this.setState({ location: options }, () => {
            // only use the root path
            if (path.length === 0) {
                if (options.name) {
                    this.onFilterChanged(options.name);
                }
                if (options.container) {
                    this.onContainerFilterChanged(options.container);
                }
            }
        });
    }

    startService(e) {
        if (!e || e.button !== 0)
            return;

        let argv;
        if (this.state.enableService)
            argv = ["systemctl", "enable", "--now", "docker.socket"];
        else
            argv = ["systemctl", "start", "docker.socket"];

        cockpit.spawn(argv, { superuser: "require", err: "message" })
                .then(() => this.init())
                .catch(err => {
                    this.setState({
                        serviceAvailable: false,
                        containersLoaded: true,
                        imagesLoaded: true
                    });
                    console.warn("Failed to start docker.socket:", JSON.stringify(err));
                });
    }

    goToServicePage(e) {
        if (!e || e.button !== 0)
            return;
        cockpit.jump("/system/services#/docker.socket");
    }

    render() {
        if (!this.state.hasDockerGroup) {
            return (
                <Page>
                    <PageSection variant={PageSectionVariants.light}>
                        <EmptyState variant={EmptyStateVariant.full}>
                            <EmptyStateHeader titleText={_("You are not a member of the docker group")} icon={<EmptyStateIcon icon={ExclamationCircleIcon} />} headingLevel="h2" />
                            <EmptyStateFooter>
                                <Button onClick={() => cockpit.jump("/users")}>
                                    {_("Manage users")}
                                </Button>
                            </EmptyStateFooter>
                        </EmptyState>
                    </PageSection>
                </Page>
            );
        }

        if (this.state.serviceAvailable === null) // not detected yet
            return (
                <Page>
                    <PageSection variant={PageSectionVariants.light}>
                        <EmptyState variant={EmptyStateVariant.full}>
                            {/* loading spinner */}
                            <Spinner size="xl" />
                            <EmptyStateHeader titleText={_("Loading...")} />
                        </EmptyState>
                    </PageSection>
                </Page>
            );

        if (!this.state.serviceAvailable) {
            return (
                <Page>
                    <PageSection variant={PageSectionVariants.light}>
                        <EmptyState variant={EmptyStateVariant.full}>
                            <EmptyStateHeader titleText={_("Docker service is not active")} icon={<EmptyStateIcon icon={ExclamationCircleIcon} />} headingLevel="h2" />
                            <EmptyStateFooter>
                                <Checkbox isChecked={this.state.enableService}
                                      id="enable"
                                      label={_("Automatically start docker on boot")}
                                      onChange={ (_event, checked) => this.setState({ enableService: checked }) } />
                                <Button onClick={this.startService}>
                                    {_("Start docker")}
                                </Button>
                                { cockpit.manifests.system &&
                                <EmptyStateActions>
                                    <Button variant="link" onClick={this.goToServicePage}>
                                        {_("Troubleshoot")}
                                    </Button>
                                </EmptyStateActions>
                                }
                            </EmptyStateFooter>
                        </EmptyState>
                    </PageSection>
                </Page>
            );
        }

        let imageContainerList = {};
        if (this.state.containers !== null) {
            Object.keys(this.state.containers).forEach(c => {
                const container = this.state.containers[c];
                const image = container.Image;
                if (imageContainerList[image]) {
                    imageContainerList[image].push({
                        container,
                        stats: this.state.containersStats[container.Id],
                    });
                } else {
                    imageContainerList[image] = [{
                        container,
                        stats: this.state.containersStats[container.Id]
                    }];
                }
            });
        } else
            imageContainerList = null;

        let startService = "";
        const action = (
            <>
                <AlertActionLink variant='secondary' onClick={this.startService}>{_("Start")}</AlertActionLink>
                <AlertActionCloseButton onClose={() => this.setState({ showStartService: false })} />
            </>
        );
        if (!this.state.serviceAvailable && this.state.privileged) {
            startService = (
                <Alert
                title={_("Docker service is available")}
                actionClose={action} />
            );
        }

        const imageList = (
            <Images
                key="imageList"
                images={this.state.imagesLoaded ? this.state.images : null}
                imageContainerList={imageContainerList}
                onAddNotification={this.onAddNotification}
                textFilter={this.state.textFilter}
                ownerFilter={this.state.ownerFilter}
                showAll={ () => this.setState({ containersFilter: "all" }) }
                user={this.state.currentUser}
                serviceAvailable={this.state.serviceAvailable}
            />
        );
        const containerList = (
            <Containers
                key="containerList"
                version={this.state.version}
                images={this.state.imagesLoaded ? this.state.images : null}
                containers={this.state.containersLoaded ? this.state.containers : null}
                containersStats={this.state.containersStats}
                filter={this.state.containersFilter}
                handleFilterChange={this.onContainerFilterChanged}
                textFilter={this.state.textFilter}
                ownerFilter={this.state.ownerFilter}
                user={this.state.currentUser}
                onAddNotification={this.onAddNotification}
                serviceAvailable={this.state.serviceAvailable}
                cgroupVersion={this.state.cgroupVersion}
                updateContainer={this.updateContainer}
            />
        );

        const notificationList = (
            <AlertGroup isToast>
                {this.state.notifications.map((notification, index) => {
                    return (
                        <Alert key={index} title={notification.error} variant={notification.type}
                               isLiveRegion
                               actionClose={<AlertActionCloseButton onClose={() => this.onDismissNotification(notification.index)} />}>
                            {notification.errorDetail}
                        </Alert>
                    );
                })}
            </AlertGroup>
        );

        const contextInfo = {
            cgroupVersion: this.state.cgroupVersion,
            registries: this.state.registries,
            selinuxAvailable: this.state.selinuxAvailable,
            dockerRestartAvailable: this.state.dockerRestartAvailable,
            version: this.state.version,
        };

        return (
            <WithDockerInfo value={contextInfo}>
                <WithDialogs>
                    <Page id="overview" key="overview">
                        {notificationList}
                        <PageSection className="content-filter" padding={{ default: 'noPadding' }}
                          variant={PageSectionVariants.light}>
                            <ContainerHeader
                              handleFilterChanged={this.onFilterChanged}
                              ownerFilter={this.state.ownerFilter}
                              textFilter={this.state.textFilter}
                            />
                        </PageSection>
                        <PageSection className='ct-pagesection-mobile'>
                            <Stack hasGutter>
                                { this.state.showStartService ? startService : null }
                                {imageList}
                                {containerList}
                            </Stack>
                        </PageSection>
                    </Page>
                </WithDialogs>
            </WithDockerInfo>
        );
    }
}

export default Application;

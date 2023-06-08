/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2022 Red Hat, Inc.
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
import cockpit from 'cockpit';
import * as utils from './util.js';

import { ListingTable } from "cockpit-components-table.jsx";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { CheckCircleIcon, ErrorCircleOIcon } from "@patternfly/react-icons";
import { CodeBlock, CodeBlockAction, CodeBlockCode } from '@patternfly/react-core/dist/esm/components/CodeBlock';
import { ClipboardCopyButton } from '@patternfly/react-core/dist/esm/components/ClipboardCopy';
import { ExpandableSection, ExpandableSectionToggle } from '@patternfly/react-core/dist/esm/components/ExpandableSection';
const _ = cockpit.gettext;

const format_nanoseconds = (ns) => {
    const seconds = ns / 1000000000;
    return cockpit.format(cockpit.ngettext("$0 second", "$0 seconds", seconds), seconds);
};

const HealthcheckOnFailureActionText = {
    none: _("No action"),
    restart: _("Restart"),
    stop: _("Stop"),
    kill: _("Force stop"),
};

const HealthLogBlock = ({ log }) => {
    const [expanded, setExpanded] = React.useState(false);
    const toggleExpanded = () => setExpanded(!expanded);

    const actions = (
        <>
            <CodeBlockAction>
                <ClipboardCopyButton variant="plain" aria-label={_("Copy to clipboard")} text={log.Output} />
            </CodeBlockAction>
        </>
    );

    let output = log.Output.split("\n");
    let extra = null;
    if (output.length > 10) {
        extra = output.slice(10).join("\n");
        output = output.slice(0, 10).join("\n");
    } else {
        output = output.join("\n");
    }

    return (
        <CodeBlock actions={actions}>
            <CodeBlockCode>
                {output}
                {extra && <ExpandableSection isDetached contentId='log-expand' onToggle={toggleExpanded}>
                    {extra}
                </ExpandableSection>}
            </CodeBlockCode>
            { extra && <ExpandableSectionToggle isExpanded={expanded} onToggle={toggleExpanded} contentId="log-expand" direction="up">
                {expanded ? 'Show Less' : 'Show More'}
            </ExpandableSectionToggle>}
        </CodeBlock>
    );
};

const ContainerHealthLogs = ({ container, containerDetail, onAddNotification, state }) => {
    let healthCheck = {};
    let failingStreak = 0;
    let logs = [];
    if (containerDetail) {
        healthCheck = containerDetail.Config.Healthcheck || containerDetail.Config.Health;
        healthCheck.HealthcheckOnFailureAction = containerDetail.Config.HealthcheckOnFailureAction;
        const healthState = containerDetail.State.Healthcheck || containerDetail.State.Health;
        failingStreak = healthState.FailingStreak || 0;
        logs = [...(healthState.Log || [])].reverse();
    }

    return (
        <>
            <Flex alignItems={{ default: "alignItemsFlexStart" }}>
                <FlexItem grow={{ default: 'grow' }}>
                    <DescriptionList isAutoFit id="container-details-healthcheck">
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Status")}</DescriptionListTerm>
                            <DescriptionListDescription>{state}</DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Command")}</DescriptionListTerm>
                            <DescriptionListDescription>{utils.quote_cmdline(healthCheck.Test)}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {healthCheck.Interval && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Interval")}</DescriptionListTerm>
                            <DescriptionListDescription>{format_nanoseconds(healthCheck.Interval)}</DescriptionListDescription>
                        </DescriptionListGroup>}
                        {healthCheck.Retries && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Retries")}</DescriptionListTerm>
                            <DescriptionListDescription>{healthCheck.Retries}</DescriptionListDescription>
                        </DescriptionListGroup>}
                        {healthCheck.StartPeriod && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Start period")}</DescriptionListTerm>
                            <DescriptionListDescription>{format_nanoseconds(healthCheck.StartPeriod)}</DescriptionListDescription>
                        </DescriptionListGroup>}
                        {healthCheck.Timeout && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Timeout")}</DescriptionListTerm>
                            <DescriptionListDescription>{format_nanoseconds(healthCheck.Timeout)}</DescriptionListDescription>
                        </DescriptionListGroup>}
                        {healthCheck.HealthcheckOnFailureAction && <DescriptionListGroup>
                            <DescriptionListTerm>{_("When unhealthy")}</DescriptionListTerm>
                            <DescriptionListDescription>{HealthcheckOnFailureActionText[healthCheck.HealthcheckOnFailureAction]}</DescriptionListDescription>
                        </DescriptionListGroup>}
                        {failingStreak !== 0 && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Failing streak")}</DescriptionListTerm>
                            <DescriptionListDescription>{failingStreak}</DescriptionListDescription>
                        </DescriptionListGroup>}
                    </DescriptionList>
                </FlexItem>
            </Flex>
            <ListingTable aria-label={_("Logs")}
                          variant='compact'
                          columns={[_("Last 5 runs"), _("Exit Code"), _("Started at")]}
                          rows={
                              logs.map(log => {
                                  const id = "hc" + log.Start + container.Id;
                                  return {
                                      expandedContent: log.Output ? <HealthLogBlock log={log} /> : null,
                                      columns: [
                                          {
                                              title: <Flex flexWrap={{ default: 'nowrap' }} spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                                                  {log.ExitCode === 0 ? <CheckCircleIcon className="green" /> : <ErrorCircleOIcon className="red" />}
                                                  <span>{log.ExitCode === 0 ? _("Passed health run") : _("Failed health run")}</span>
                                              </Flex>
                                          },
                                          {
                                              title: <pre>{log.ExitCode}</pre>
                                          },
                                          utils.localize_time(Date.parse(log.Start) / 1000)
                                      ],
                                      props: {
                                          key: id,
                                          "data-row-id": id,
                                      },
                                  };
                              })
                          } />
        </>
    );
};

export default ContainerHealthLogs;

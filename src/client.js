import rest from './rest.js';

const DOCKER_ADDRESS = "/var/run/docker.sock";
export const VERSION = "/v1.43";

export function getAddress() {
    return DOCKER_ADDRESS;
}

function dockerCall(name, method, args, body) {
    const options = {
        method,
        path: VERSION + name,
        body: body || "",
        params: args,
    };

    if (method === "POST" && body)
        options.headers = { "Content-Type": "application/json" };

    // console.log("dockerCall", options);

    return rest.call(getAddress(), options);
}

const dockerJson = (name, method, args, body) => dockerCall(name, method, args, body)
        .then(reply => JSON.parse(reply));

function dockerMonitor(name, method, args, callback) {
    const options = {
        method,
        path: VERSION + name,
        body: "",
        params: args,
    };

    // console.log("dockerMonitor", options);

    const connection = rest.connect(getAddress());
    return connection.monitor(options, callback);
}

export const streamEvents = (callback) => dockerMonitor("/events", "GET", {}, callback);

export function getInfo() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), 15000);
        dockerJson("/info", "GET", {})
                .then(reply => resolve(reply))
                .catch(reject)
                .finally(() => clearTimeout(timeout));
    });
}

export const getContainers = () => dockerJson("/containers/json", "GET", { all: true });

export const streamContainerStats = (id, callback) => dockerMonitor("/containers/" + id + "/stats", "GET", { stream: true }, callback);

export function inspectContainer(id) {
    const options = {
        size: false // set true to display filesystem usage
    };
    return dockerJson("/containers/" + id + "/json", "GET", options);
}

export const delContainer = (id, force) => dockerCall("/containers/" + id, "DELETE", { force });

export const renameContainer = (id, config) => dockerCall("/containers/" + id + "/rename", "POST", config);

export const createContainer = (config) => dockerJson("/containers/create", "POST", {}, JSON.stringify(config));

export const commitContainer = (commitData) => dockerCall("/commit", "POST", commitData);

export const postContainer = (action, id, args) => dockerCall("/containers/" + id + "/" + action, "POST", args);

export function execContainer(id) {
    const args = {
        AttachStderr: true,
        AttachStdout: true,
        AttachStdin: true,
        Tty: true,
        Cmd: ["/bin/sh"],
    };

    return dockerJson("/containers/" + id + "/exec", "POST", {}, JSON.stringify(args));
}

export function resizeContainersTTY(id, exec, width, height) {
    const args = {
        h: height,
        w: width,
    };

    let point = "containers/";
    if (!exec)
        point = "exec/";

    console.log("resizeContainersTTY", point + id + "/resize", args);
    return dockerCall("/" + point + id + "/resize", "POST", args);
}

function parseImageInfo(info) {
    const image = {};

    if (info.Config) {
        image.Entrypoint = info.Config.Entrypoint;
        image.Command = info.Config.Cmd;
        image.Ports = Object.keys(info.Config.ExposedPorts || {});
        image.Env = info.Config.Env;
    }
    image.Author = info.Author;

    return image;
}

export function getImages(id) {
    const options = {};
    if (id)
        options.filters = JSON.stringify({ id: [id] });
    return dockerJson("/images/json", "GET", options)
            .then(reply => {
                const images = {};
                const promises = [];

                for (const image of reply) {
                    images[image.Id] = image;
                    promises.push(dockerJson("/images/" + image.Id + "/json", "GET", {}));
                }

                return Promise.all(promises)
                        .then(replies => {
                            for (const info of replies) {
                                images[info.Id] = Object.assign(images[info.Id], parseImageInfo(info));
                            }
                            return images;
                        });
            });
}

export const delImage = (id, force) => dockerJson("/images/" + id, "DELETE", { force });

export const untagImage = (id, repo, tag) => dockerCall("/images/" + id + "/untag", "POST", { repo, tag });

export function pullImage(reference) {
    return new Promise((resolve, reject) => {
        const options = {
            fromImage: reference,
        };
        dockerCall("/images/create", "POST", options)
                .then(r => {
                    // Need to check the last response if it contains error
                    const responses = r.trim().split("\n");
                    const response = JSON.parse(responses[responses.length - 1]);
                    if (response.error) {
                        response.message = response.error;
                        reject(response);
                    } else if (response.cause) // present for 400 and 500 errors
                        reject(response);
                    else
                        resolve();
                })
                .catch(reject);
    });
}

export const pruneUnusedImages = () => dockerJson("/images/prune", "POST", {});

export const imageHistory = (id) => dockerJson(`/images/${id}/history`, "GET", {});

export const imageExists = (id) => dockerCall("/images/" + id + "/json", "GET", {});

export const containerExists = (id) => dockerCall("/containers/" + id + "/json", "GET", {});

import cockpit from "cockpit";
import { debug } from "./util.js";

function manage_error(reject, error, content) {
    let content_o = {};
    if (content) {
        try {
            content_o = JSON.parse(content);
        } catch {
            content_o.message = content;
        }
    }
    const c = { ...error, ...content_o };
    reject(c);
}

// calls are async, so keep track of a call counter to associate a result with a call
let call_id = 0;

function connect(address) {
    /* This doesn't create a channel until a request */
    const http = cockpit.http(address, { superuser: null });
    const connection = {};

    connection.monitor = function(options, callback, return_raw) {
        return new Promise((resolve, reject) => {
            let buffer = "";

            http.request(options)
                    .stream(data => {
                        if (return_raw)
                            callback(data);
                        else {
                            buffer += data;
                            const chunks = buffer.split("\n");
                            buffer = chunks.pop();

                            chunks.forEach(chunk => {
                                debug("monitor", chunk);
                                callback(JSON.parse(chunk));
                            });
                        }
                    })
                    .catch((error, content) => {
                        manage_error(reject, error, content);
                    })
                    .then(resolve);
        });
    };

    connection.call = function (options) {
        const id = call_id++;
        debug(`call ${id}:`, JSON.stringify(options));
        return new Promise((resolve, reject) => {
            options = options || {};
            http.request(options)
                    .then(result => {
                        debug(`call ${id} result:`, JSON.stringify(result));
                        resolve(result);
                    })
                    .catch((error, content) => {
                        debug(`call ${id} error:`, JSON.stringify(error), "content", JSON.stringify(content));
                        manage_error(reject, error, content);
                    });
        });
    };

    connection.close = function () {
        http.close();
    };

    return connection;
}

/*
 * Connects to the docker service, performs a single call, and closes the
 * connection.
 */
async function call (address, parameters) {
    const connection = connect(address);
    const result = await connection.call(parameters);
    connection.close();
    // if (parameters.method === "GET")
    //     return result;

    // let p = {};
    // try {
    //     p = JSON.parse(result);
    // } catch {
    //     p = result;
    // }
    // console.log("call", { method: parameters.method, path: parameters.path, parameters, result: p });

    return result;
}

export default {
    connect,
    call
};

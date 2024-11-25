const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const expValuePairs = {};

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        let streamLength = input.length;

        if (input.includes("PING")) {
            connection.write("+PONG\r\n");
        } else if (input.includes("ECHO")) {
            connection.write(`${input[3]}\r\n${input[4]}\r\n`);
        } else if (input.includes("SET")) {
            if (!input.includes("PX") && !input.includes("px") && !input.includes("pX") && !input.includes("Px")) {
                keyValuePairs[input[streamLength - 4]] = input[streamLength - 2];
            } else {
                const time = input[streamLength - 2];
                expValuePairs[input[streamLength - 8]] = Date.now() + parseInt(time);
                keyValuePairs[input[streamLength - 8]] = input[streamLength - 6];
            }
            connection.write("+OK\r\n");
        } else if (input.includes("GET")) {
            const key = input[streamLength - 2];

            // First check if the key exists at all
            if (!(key in keyValuePairs)) {
                connection.write("$-1\r\n");
                return;
            }

            // Then check expiry if it exists
            if (key in expValuePairs) {
                if (Date.now() > expValuePairs[key]) {
                    // Key has expired
                    delete keyValuePairs[key];
                    delete expValuePairs[key];
                    connection.write("$-1\r\n");
                    return;
                }
            }

            // Key exists and is not expired
            const value = keyValuePairs[key];
            connection.write(`$${value.length}\r\n${value}\r\n`);

        } else if (input.includes("INFO")) {
            const serverKeyValuePair = `role:${serverType}`;
            connection.write(`$${serverKeyValuePair.length}\r\n${serverKeyValuePair}\r\n`);
        }
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});
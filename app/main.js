const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const keyExpiries = {};

    const checkExpiry = (key) => {
        if (key in keyExpiries && Date.now() >= keyExpiries[key]) {
            delete keyValuePairs[key];
            delete keyExpiries[key];
            return true;
        }
        return false;
    };

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        const command = input[2]?.toUpperCase();

        if (!command) {
            return connection.write("-ERR Malformed command\r\n");
        }

        switch (command) {
            case "PING":
                connection.write("+PONG\r\n");
                break;

            case "ECHO":
                if (input.length < 5) {
                    connection.write("-ERR Wrong number of arguments\r\n");
                    break;
                }
                const message = input[4];
                connection.write(`$${message.length}\r\n${message}\r\n`);
                break;

            case "SET":
                if (input.length < 7) {
                    connection.write("-ERR Wrong number of arguments\r\n");
                    break;
                }
                const setKey = input[4];
                const setValue = input[6];
                const pxIndex = input.indexOf("PX");

                keyValuePairs[setKey] = setValue;

                if (pxIndex !== -1 && input[pxIndex + 1]) {
                    const expiry = parseInt(input[pxIndex + 1], 10);
                    if (!isNaN(expiry)) {
                        keyExpiries[setKey] = Date.now() + expiry;
                    }
                } else {
                    delete keyExpiries[setKey];
                }

                connection.write("+OK\r\n");
                break;

            case "GET":
                if (input.length < 5) {
                    connection.write("-ERR Wrong number of arguments\r\n");
                    break;
                }
                const getKey = input[4];

                if (checkExpiry(getKey) || !(getKey in keyValuePairs)) {
                    connection.write("$-1\r\n");
                } else {
                    const value = keyValuePairs[getKey];
                    connection.write(`$${value.length}\r\n${value}\r\n`);
                }
                break;

            case "INFO":
                if (input[4] && input[4].toLowerCase() === "replication") {
                    const serverKeyValuePair = `role:${serverType}`;
                    connection.write(`$${serverKeyValuePair.length}\r\n${serverKeyValuePair}\r\n`);
                } else {
                    connection.write("-ERR unknown INFO section\r\n");
                }
                break;

            default:
                connection.write("-ERR Unknown command\r\n");
        }
    });

    // Periodic cleanup of expired keys
    const cleanup = setInterval(() => {
        for (const key in keyExpiries) {
            checkExpiry(key);
        }
    }, 50);

    connection.on('end', () => {
        clearInterval(cleanup);
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});
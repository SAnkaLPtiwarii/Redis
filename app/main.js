const net = require("net");

const getPortNumber = () => {
    const args = process.argv;
    const portIndex = args.indexOf('--port');
    if (portIndex !== -1 && args[portIndex + 1]) {
        const port = parseInt(args[portIndex + 1], 10);
        if (!isNaN(port)) {
            return port;
        }
    }
    return 6379;
};
const portNumber = getPortNumber();

const store = new Map();
const expiries = new Map();


const server = net.createServer((connection) => {
    connection.on("data", (data) => {
        const commands = Buffer.from(data).toString().split("\r\n");

        if (commands.length < 2) {
            return connection.write("Malformed command\r\n");
        }

        const command = commands[2].toUpperCase(); // ECHO, SET, GET commands are expected in uppercase

        if (command === "ECHO") {
            if (commands.length < 5) {
                return connection.write("Malformed command\r\n");
            }
            const str = commands[4];
            const l = str.length;
            connection.write("$" + l + "\r\n" + str + "\r\n");

        } else if (command === "SET") {
            if (commands.length < 7) {
                return connection.write("Malformed command\r\n");
            }
            const key = commands[4];
            const value = commands[6];
            store.set(key, value);

            // Check for PX (expiry in milliseconds) argument
            if (commands.length >= 11 && commands[8].toUpperCase() === "PX") {
                const expiryTime = parseInt(commands[10], 10);
                const expiryDate = Date.now() + expiryTime;
                expiries.set(key, expiryDate);

                setTimeout(() => {
                    store.delete(key);
                    expiries.delete(key);
                }, expiryTime);
            }

            connection.write("+OK\r\n");

        } else if (command === "GET") {
            if (commands.length < 5) {
                return connection.write("Malformed command\r\n");
            }
            const key = commands[4];
            if (store.has(key)) {
                const value = store.get(key);

                // Check if the key has expired
                if (expiries.has(key) && expiries.get(key) < Date.now()) {
                    store.delete(key);
                    expiries.delete(key);
                    return connection.write("$-1\r\n");
                }

                const l = value.length;
                connection.write("$" + l + "\r\n" + value + "\r\n");
            } else {
                connection.write("$-1\r\n");
            }

        } else if (command === "PING") {
            connection.write("+PONG\r\n");

        } else {
            connection.write("-ERR unknown command\r\n");
        }
    });
});
// Start the server on port 6379
server.listen(portnumber, "127.0.0.1", () => {
    console.log(`Server started on port ${portnumber}`);
});
const net = require("net");

const store = new Map();
const expiries = new Map();


const server = net.createServer((connection) => {
    connection.on("data", (data) => {
        const commands = Buffer.from(data).toString().split("\r\n");

        if (commands[2] === 'SET' && commands.length >= 7) {
            const key = commands[4];
            const value = commands[6];
            store.set(key, value);
            expiries.delete(key); // Remove any existing expiry for this key

            // Handle PX (expiry time in milliseconds) argument
            if (commands.length >= 9 && commands[8] === 'PX') {
                const expiry = parseInt(commands[9], 10);
                const expiryTime = Date.now() + expiry;
                expiries.set(key, expiryTime);

                setTimeout(() => {
                    if (Date.now() >= expiryTime) {
                        store.delete(key);
                        expiries.delete(key);
                    }
                }, expiry);
            }

            return connection.write("+OK\r\n");
        }

        // Handle GET command
        else if (commands[2] === 'GET' && commands.length >= 5) {
            const key = commands[4];

            if (store.has(key)) {
                if (expiries.has(key) && Date.now() > expiries.get(key)) {
                    store.delete(key);
                    expiries.delete(key);
                    return connection.write("$-1\r\n");
                } else {
                    const value = store.get(key);
                    return connection.write(`$${value.length}\r\n${value}\r\n`);
                }
            } else {
                return connection.write("$-1\r\n");
            }
        }


        // Check if it's a PING command
        else if (commands[0] === '*1' && commands[2] === 'PING') {
            return connection.write("+PONG\r\n");
        }
        // Check if it's an ECHO command
        else if (commands[0] === '*2' && commands[2] === 'ECHO') {
            const str = commands[4];
            const l = str.length;
            return connection.write(`$${l}\r\n${str}\r\n`);
        }
        // If the command is not recognized
        else {
            return connection.write("-ERR unknown command\r\n");
        }
    });
});
// Start the server on port 6379
server.listen(6379, "127.0.0.1", () => {
    console.log("Server started on port 6379");
});
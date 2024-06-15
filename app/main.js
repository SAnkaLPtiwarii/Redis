const net = require("net");

const storage = {};


// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server = net.createServer((connection) => {
    console.log("New client connected");
    const commands = Buffer.from(data).toString().split("\r\n");

    // Check if it's a SET command
    if (commands[0] === '*3' && commands[2] === 'SET') {
        const key = commands[4];
        const value = commands[6];
        store[key] = value;
        return connection.write("+OK\r\n");
    }
    // Check if it's a GET command
    else if (commands[0] === '*2' && commands[2] === 'GET') {
        const key = commands[4];
        const value = store[key];
        if (value !== undefined) {
            return connection.write(`$${value.length}\r\n${value}\r\n`);
        } else {
            return connection.write("$-1\r\n");
        }
    }

    // Handle data received from the client
    connection.on("data", (data) => {
        const commands = Buffer.from(data).toString().split("\r\n");

        // Check if it's an ECHO command
        if (commands[0] === '*2' && commands[2] === 'ECHO') {
            const str = commands[4];
            const l = str.length;
            return connection.write(`$${l}\r\n${str}\r\n`);
        }
        // Check if it's a PING command
        else if (commands[0] === '*1' && commands[2] === 'PING') {
            return connection.write("+PONG\r\n");
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

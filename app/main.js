const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server = net.createServer((connection) => {
    console.log("New client connected");

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

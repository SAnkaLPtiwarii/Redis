const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server = net.createServer((connection) => {
    console.log("New client connected");

    // Handle data received from the client
    connection.on('data', (data) => {
        console.log("Received data:", data.toString());
        // Respond with +PONG\r\n for each received data (each PING)
        const commands = data.toString().split("\r\n");
        // *2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n
        if (commands.length >= 3 && commands[2] === "ECHO") {
            const str = commands[2]; // This is the argument for ECHO
            const l = str.length; // Length of the argument
            connection.write(`$${l}\r\n${str}\r\n`); // Respond with the argument
        } else {
            connection.write("-ERR unknown command\r\n");
        }
    });
    connection.write('+PONG\r\n');

    // Handle client disconnection
    connection.on('end', () => {
        console.log("Client disconnected");
    });
});

// Start the server on port 6379
server.listen(6379, "127.0.0.1", () => {
    console.log("Server started on port 6379");
});

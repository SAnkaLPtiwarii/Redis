const net = require('net');

const client = new net.Socket();

client.connect(6379, '127.0.0.1', () => {
    console.log('Connected to server');

    // Test PING command

    client.write('*1\r\n$4\r\nPING\r\n');

});

client.on('data', (data) => {
    console.log('Received: ' + data);

    // Test ECHO command after receiving response for PING
    if (data.toString().includes('PONG')) {
        client.write('*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n');
    } else if (data.toString().includes('hey')) {
        client.destroy(); // Kill client after receiving ECHO response
    }
});

client.on('close', () => {
    console.log('Connection closed');
});

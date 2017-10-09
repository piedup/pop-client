var create = require('./create');
var httpServer = require('./httpServer');

const client = create();
const server = httpServer(client);

server.listen(5000, () => {
    console.log(`Listening on ${server.address().port}`)
})
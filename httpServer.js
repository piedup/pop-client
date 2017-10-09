const express = require('express');
const http = require('http');
const websocket = require('ws');
const url = require('url');
const bodyParser = require('body-parser');

function httpServer(client) {
    const app = express();
    app.disable('x-powered-by');
    app.use(bodyParser.json({ type: () => true, strict: false }));
    
    app.get('/', (req, res) => {
      res.json({ name: 'Fabric store', description: 'None', verion: '0.0.1', commit: 'None' });
    });
    
    // saveSegment
    app.post('/segments', (req, res, next) => {
      console.log('Saving segment');
      const segment = req.body;
      console.log(segment);
      client.saveSegment(JSON.stringify(req.body))
        .then(() => {
          res.json(segment);
        }).catch(next);
    });
    
    // getSegment
    app.get('/segments/:linkHash', (req, res, next) => {
      console.log('Getting segment');
      console.log(req.url);
      client.getSegment(req.params.linkHash)
        .then((segment) => {
          res.json(JSON.parse(segment));
        }).catch(next);
    });
    
    // findSegments
    app.get('/segments', (req, res, next) => {
      console.log('Finding segments');
      client.findSegments(url.parse(req.url).query || '')
        .then((segments) => {
          res.json(JSON.parse(segments));
        }).catch(next);
    });
    
    // getMapIds
    app.get('/maps', (req, res, next) => {
      console.log('Finding maps');
      client.getMapIds(url.parse(req.url).query || '')
        .then((mapIds) => {
          res.json(JSON.parse(mapIds) || []);
        }).catch(next);
    });
    
    const server = http.createServer(app);
    const wss = new websocket.Server({ server });

    return server;
}

module.exports = httpServer;
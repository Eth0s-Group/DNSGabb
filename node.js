'use strict';

let dns = require('native-dns');
let server = dns.createServer();

server.on('listening', () => console.log('server listening on', server.address()));
server.on('close', () => console.log('server closed', server.address()));
server.on('error', (err, buff, req, res) => console.error(err.stack));
server.on('socketError', (err, socket) => console.error(err));

server.serve(53);

let authority = { address: '8.8.8.8', port: 53, type: 'udp' };

function proxy(question, response, cb) {
  console.log('proxying', question.name);

  var request = dns.Request({
    question: question, // forwarding the question
    server: authority,  // this is the DNS server we are asking
    timeout: 1000
  });

  // when we get answers, append them to the response
  request.on('message', (err, msg) => {
    msg.answer.forEach(a => response.answer.push(a));
  });

  request.on('end', cb);
  request.send();
}

let async = require('async');

function handleRequest(request, response) {
  console.log('request from', request.address.address, 'for', request.question[0].name);

  let f = []; // array of functions

  // proxy all questions
  // since proxying is asynchronous, store all callbacks
  request.question.forEach(question => {
    f.push(cb => proxy(question, response, cb));
  });

  // do the proxying in parallel
  // when done, respond to the request by sending the response
  async.parallel(f, function() { response.send(); });
}

server.on('request', handleRequest);

let entries = [
  {
    domain: "^hello.peteris.*",
    records: [
      { type: "A", address: "127.0.0.99", ttl: 1800 }
    ]
  }
];

function handleRequest(request, response) {
  console.log('request from', request.address.address, 'for', request.question[0].name);

  let f = [];

  request.question.forEach(question => {
    let entry = entries.filter(r => new RegExp(r.domain, 'i').exec(question.name));
    if (entry.length) {
      entry[0].records.forEach(record => {
        record.name = question.name;
        record.ttl = record.ttl || 1800;
        response.answer.push(dns[record.type](record));
      });
    } else {
      f.push(cb => proxy(question, response, cb));
    }
  });
  
  entry[0].records.forEach(record => {
  record.name = question.name;
  record.ttl = record.ttl || 1800;
  if (record.type == 'CNAME') {
    record.data = record.address;
    f.push(cb => proxy({ name: record.data, type: dns.consts.NAME_TO_QTYPE.A, class: 1 }, response, cb));
  }
  response.answer.push(dns[record.type](record));
});

let fs = require('fs');
let express = require('express');
let bodyParser = require('body-parser');

let entries = require('./records.json');
let password = 'ilovekittens';

let app = express();

app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get('/load', (req, res) => {
  res.send(entries);
});

app.post('/save', (req, res) => {
  if (req.query.password == password) {
    entries = req.body;
    fs.writeFileSync('records.json', JSON.stringify(entries));
    res.send('ok');
  } else {
    res.status(401).send('wrong');
  }
});

app.listen(5380);

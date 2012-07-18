
/**
 * Module dependencies.
*/

var express = require('express'),
    io = require('socket.io'),
    routes = require('./routes'),
    fs = require('fs'),
    path = require('path'),
    Logger = require('./logger');
    config = require('./config.json');


var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use(express.limit('150mb'));
});
app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});
app.configure('production', function(){
  app.use(express.errorHandler()); 
});

//Setup socket
var sio=io.listen(app, {log: false});

// Simple Basic Authentication Middleware(http://node-js.ru/3-writing-express-middleware)
function basic_auth (req, res, next) {
  //If authententication is not configured then it is not required...
  if (config.auth_username == "" || config.auth_password == "") {
    return;
  }
  if (req.headers.authorization && req.headers.authorization.search('Basic ') === 0) {
    // fetch login and password
    if (new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString() == config.auth_username + ':' + config.auth_password) {
      next();
      return;
    }
  }
  console.log('Unable to authenticate user');
  console.log(req.headers.authorization);
  res.header('WWW-Authenticate', 'Basic realm="Admin Area"');
  if (req.headers.authorization) {
    setTimeout(function () {
      res.send('Authentication required', 401);
    }, 5000);
  } else {
    res.send('Authentication required', 401);
  }
}

// Routes
app.get('/', basic_auth, routes.index);
var bundle;
app.post('/', basic_auth, function(req, res) {
  var name
  if (req.body.bundle) {
    name = path.basename(req.body.bundle).replace(".zip","");
    bundle = req.body.bundle;
  } else if (config.allow_remote_bundles) {
    Logger.log("WARN", null, "Remote Bundle Received");
    name = req.files.bundle.name.replace(".zip","");
    bundle = req.files.bundle.path
    console.log(req.body);
  } else {
    res.send("Forbidden", 403);
  } 
  Logger.log("INFO", null, "New Bundle: " + bundle + " | " + name);
  sio.sockets.emit("bundle", {name: name, spec: req.body.spec == 'true'});
  res.send("OK", 200);
});
app.post('/clear_cache', basic_auth, function(req,res) {
  Logger.info("Clear Cache Requested");
  sio.sockets.emit("clear");
  res.send("OK", 200);
});
// Currently unauthenticated, this is nice when doing demonstrations
app.get('/bundle', function(req,res) {
  Logger.debug("Bundle requested." );
  res.setHeader('Content-disposition', 'attachment; filename=bundle.zip');
  res.setHeader('Content-type', "application/zip");

  var filestream = fs.createReadStream(bundle);
  filestream.on('data', function(chunk) {
    res.write(chunk);
  });
  filestream.on('end', function() {
    res.end();
  });
  filestream.on('error', function(exception) {
      Logger.error(exception);
  });
});


//FIRE IT UP
app.listen(config.server_port);
Logger.debug("TiShadow server started. Go to http://localhost:3000");

//WEB SOCKET STUFF

var devices = [];
sio.sockets.on('connection', function(socket) {
  Logger.debug('A socket connected');
  // Join
  socket.on('join', function(e) {
    if (e.name === "controller") {
      socket.set('host', true, function() {Logger.log("INFO", "CONTROLLER", "Connected")});
      devices.forEach(function(d) {
        sio.sockets.emit("device_connect", {name: d, id: new Buffer(d).toString('base64')});
      });
    } else{
      socket.set('name', e.name);
      socket.set('host', false, function() {Logger.log("INFO", e.name, "Connected")});
      e.id = new Buffer(e.name).toString('base64');
      sio.sockets.emit("device_connect", e);
      devices.push(e.name);
    }
  });
  // generate event
  socket.on('generate', function(data) {
    socket.get("host", function (err,host){
      if (host){
        sio.sockets.emit("message", data);
      }
    });
  });

  socket.on('log', function(data) {
    socket.get("name", function(err, name) {
      data.name = name;
      Logger.log(data.level, data.name, data.message);
      sio.sockets.emit("device_log", data);
    });
  })
  // Disconnect
  socket.on('disconnect',function(data) {
    socket.get("host",function(err,host) {
      if (host) {
        sio.sockets.emit('disconnect');
      } else {
        socket.get("name", function(err, name) {
          Logger.log("WARN", name,"Disconnected");
          sio.sockets.emit("device_disconnect", {name: name, id: new Buffer(name).toString('base64')});
          devices.splice(devices.indexOf(name),1);
        });
      }
    });
  });

});

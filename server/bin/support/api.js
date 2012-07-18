var http = require("http"),
    fs = require("fs"),
    _path = require("path"),
    config = require("./config");

function postRequest(path) {
  var post_options = {
    host: config.server,
    port: config.port,
    path: path,
    method: 'POST'
  };
  var req = http.request(post_options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      console.log('Response: ' + chunk);
    });
  }); 
  return req;
}

function postToServer(path, data) {
  var jdata = JSON.stringify(data||{});
  var req = postRequest(path);
  req.setHeader("Content-Type", "application/json");
  req.setHeader( "Content-Length", jdata.length);
  req.write(jdata);
  req.end(); 
}

function postZipToServer (path, data) {
  var request = postRequest(path);
  var boundaryKey = Math.random().toString(16); // random string
  request.setHeader('Content-Type', 'multipart/form-data; boundary="'+boundaryKey+'"');
  request.write(
    '--' + boundaryKey + '\r\n'
    + 'Content-Type: application/text\r\n' 
    + 'Content-Disposition: form-data; name="spec"\r\n\r\n'
    + data.spec + "\r\n"
    + '--' + boundaryKey + '\r\n'
    + 'Content-Type: application/zip\r\n' 
    + 'Content-Disposition: form-data; name="bundle"; filename="' + _path.basename(config.bundle_file) + '"\r\n'
    + 'Content-Transfer-Encoding: binary\r\n\r\n' 
  );
  console.log(config.bundle_file);
  var stream = fs.createReadStream(config.bundle_file, { bufferSize: 4 * 1024 })
    .on('end', function() {
      request.end('\r\n--' + boundaryKey + '--'); 
    })
    .pipe(request, { end: false })
}

exports.clearCache = function() {
  postToServer("/clear_cache");
};

exports.newBundle = function(data) {
  if (config.server === "localhost") {
    postToServer("/", {bundle:config.bundle_file, spec: config.isSpec});
  } else {
    postZipToServer("/", {spec: config.isSpec});
  }
};



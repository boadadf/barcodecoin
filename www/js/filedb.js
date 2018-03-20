var path = require('path');
var fs = require('fs');

function FileDB() {
  this.sortedFileNames = [];
  this.dbName;
}

FileDB.prototype = {
  open: function(dbName) {
	this.sortedFileNames = findFilesInDir(dbName);	
  },  
  store: function(entry) {
	var file = fs.createWriteStream(this.dbName+(this.sortedFileNames+1));
	file.on('error', function(err) { /* Use error handler */ });
	file.write(entry);
	file.end();
  },
  last: function() {
	return fs.readFileSync(this.sortedFileNames[this.sortedFileNames.length-1], 'utf8');
  }
}

function findFilesInDir(dbName){
    var startPath = dbName.substr(0,dbName.lastIndexOf('/'));
    var filePrefix = dbName.substr(dbName.lastIndexOf('/')+1);
    var results = [];

    if (!fs.existsSync(startPath)){
        console.log("no dir ",startPath);
        return;
    }

    var files=fs.readdirSync(startPath);
    for(var i=0;i<files.length;i++){
        var filename=path.join(startPath,files[i]);
        var stat = fs.lstatSync(filename);
        if (stat.isDirectory()){
            results = results.concat(findFilesInDir(filename,filePrefix)); //recurse
        } else if (filename.indexOf(filePrefix)>=0) {
            console.log('-- found: ',filename);
            results.push(filename);
        }
    }
    return results;
}
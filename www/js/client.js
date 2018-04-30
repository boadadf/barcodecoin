if( typeof cryptico !== 'undefined') {
	cryptico.sign = function(plaintext, signingkey) {
	    var signString = cryptico.b16to64(signingkey.signString(plaintext, "sha256"));
	    plaintext += "::52cee64bb3a38f6403386519a39ac91c::";
	    plaintext += cryptico.publicKeyString(signingkey);
	    plaintext += "::52cee64bb3a38f6403386519a39ac91c::";
	    plaintext += signString;
	    console.log('signed text:'+plaintext);
	    return plaintext;
	}

	cryptico.verify = function(plaintext) {
	    console.log(plaintext);
	    plaintext = plaintext.split("::52cee64bb3a38f6403386519a39ac91c::");
	    if(plaintext.length == 3)
	    {
		var publickey = cryptico.publicKeyFromString(plaintext[1]);
		var signature = cryptico.b64to16(plaintext[2]);
		if(publickey.verifyString(plaintext[0], signature))
		{
		    return {status: "success", 
			    plaintext: plaintext[0], 
			    signature: "verified", 
			    publicKeyString: cryptico.publicKeyString(publickey)};
		}
		else
		{
		    return {status: "success", 
			    plaintext: plaintext[0], 
			    signature: "forged", 
			    publicKeyString: cryptico.publicKeyString(publickey)};
		}
	    }
	    else
	    {
		return {status: "failure"};
	    }
	}
}

if( typeof RSAKey !== 'undefined') {
	RSAKey.fromJSON = function(key) {
	    let json = JSON.parse(key);
	    if (json.type !== 'RSAKey') return null;
	    let rsa = new RSAKey();
	    rsa.setPrivateEx(json.n, json.e, json.d, json.p, json.q, json.dmp1, json.dmq1, json.coeff);
	    return rsa;
	}

	// instance serializer, JSON.stringify(object_with_RSAKey) will serialize as expected.
	RSAKey.prototype.toJSON = function() {
	    return JSON.stringify({
	      type: 'RSAKey',
	      coeff: this.coeff.toString(16),
	      d: this.d.toString(16),
	      dmp1: this.dmp1.toString(16),
	      dmq1: this.dmq1.toString(16),
	      e: this.e.toString(16),
	      n: this.n.toString(16),
	      p: this.p.toString(16),
	      q: this.q.toString(16)
	    })
	}	
}
function Client() {
	this.publicKeyID;
	this.privateKey;
	this.last_proof;
	this.transactions;
	this.serverPublicKeyID;
}

Client.prototype = {
	getBalance: function(callback) {
		var url = "balance?wallet_id="+encodeURIComponent(client.publicKeyID);
		callGet(url, (jsonResponse)=> {
			var message = jsonResponse['balance'];				
			callback(message);
		   });
	},
	createWallet: function() {
		var privateKey = createPrivateKey();				
		var publicKeyID = createPublicKeyID(privateKey);
		var wallet = {"publicKeyID": publicKeyID,
					"privateKey": privateKey.toJSON()};
		var jsonWallet = JSON.stringify(wallet);	
		downloadJson("key.json", jsonWallet);		
		this.loadWallet(wallet);
	},
	loadWallet: function(jsonWallet) {				
		var publicKeyID = jsonWallet["publicKeyID"];
		var privateKey = jsonWallet["privateKey"];		
		localStorage.setItem("publicKeyID", publicKeyID);
		localStorage.setItem("privateKey", JSON.stringify(privateKey));	
		loadKey();	
	},
	loadServerPublicKey: function() {	
		var g = this;
		callGet("publicKeyID", function(jsonResponse) {
			var key = jsonResponse['publicKeyID'];
			g.serverPublicKeyID = key;
		});
	},	
	getBlockLength: function(callback) {
		callGet("/blockchain/length", function(jsonResponse) {
			var length = jsonResponse['length'];
			callback(length);
		});
	},
	loadBlockChainTransactions: function(index, callback) {
		callGet("/blockchain?index="+index, function(jsonResponse) {
		console.log('received:'+jsonResponse);
			var blockchain = JSON.parse(jsonResponse);
			callback(index, blockchain);
		});
	},
	getNodes: function(callback) {
		callGet("/nodes/list", function(jsonResponse) {
			var nodes = jsonResponse['nodes'];
			callback(nodes);
		});
	},
	loadTransactions: function(callback) {
		var g = this;
		callGet("/transactions/list", function(jsonResponse) {
			var transactions = jsonResponse['transactions'];
			g.transactions = transactions;
			//Add our reward.
			var message = JSON.stringify({"sender":0, "recipient":g.publicKeyID, "amount":25, "timestamp": +new Date()});
			var signedMessage = cryptico.sign(message, g.privateKey);
			g.transactions.push(signedMessage);
			callback(g.transactions);
		});
	},
	loadLastProof: function(decoder, callback) {
		var g = this;
		callGet("/blockchain/lastproof", function(jsonResponse) {
			var proof = jsonResponse['proof'];
			console.log('proof:'+proof);
			decoder(proof, function(decodedValue){
				console.log('set last_proof:'+decodedValue);
				g.last_proof = decodedValue;
				console.log('set last_proof:'+this.last_proof);
			}, callback);
		});		
	},
	isValidToken: function( barcode_data) {
		var guess = this.last_proof + '' + barcode_data;
		var guessHash = sha256(guess);
		console.log('result:'+guessHash);
		return guessHash.endsWith("0");
	}, 
	transfer: function(senderPrivateKey, recipient, amount, callback) {		
		var url = "balance?wallet_id="+encodeURIComponent(this.publicKeyID);		
		callGet(url, (jsonResponse)=>{
			var balance = jsonResponse['balance'];
			if('all'==amount) {
				amount = balance;
			}
			if(balance && !isNaN(balance) && Number(balance)>=amount) {			
				var message = JSON.stringify({"sender":this.publicKeyID,"recipient":recipient,"amount":amount, "timestamp":+new Date()});
				var SignResult = cryptico.sign(message, senderPrivateKey);
				var param = "message="+encodeURIComponent(SignResult);
				upload("transactions/new", param, function(jsonResponse) {
					var status = jsonResponse['message'];	
					callback(status);
				});
			} else {
				console.log('Cannot transfer:'+balance+'  '+(!isNaN(balance))+'  '+(Number(balance)>=amount)+' '+amount);
				callback('Cannot transfer:'+balance);
			}
		});
	},
	transferToNewWallet: function(amount, callback, callbackError) {
		var recipientPrivateKey = createPrivateKey();	
		var recipientpublicKeyID = createPublicKeyID(recipientPrivateKey);		
		this.transfer(client.privateKey, recipientpublicKeyID, amount, (status)=> {
			if('accepted'==status) {
				var jsonPrivateKey = JSON.stringify({'privateKey':recipientPrivateKey.toJSON()});
				callback(jsonPrivateKey);
			} else {
				callbackError(status);
			}
		});
	}, transferAll: function(senderPrivateKey, callback) {
		this.transfer(senderPrivateKey, this.publicKeyID, 'all', callback);	
	}		
};

function upload(url, message, callback) {		
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4 && (this.status == 200|| this.status == 201|| this.status == 400)) {			
			var jsonResponse = JSON.parse(this.responseText);
			callback(jsonResponse);
	   }
	};

	xhttp.open("POST", url, true);
	xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	xhttp.send(message);
}

function callGet(url, callback) {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {						
			var jsonResponse = JSON.parse(this.responseText);
			callback(jsonResponse);
	   }
	};
	xhttp.open("GET", url, true);
	xhttp.send();
}

function onFileSelected(event, callback) {
  var selectedFile = event.target.files[0];
  var reader = new FileReader();
  reader.onload = function(event) {
	var json = JSON.parse(event.target.result);
	callback(json);
	//Prepare for next call.
	document.getElementById('files').value = "";
  };
  reader.readAsText(selectedFile);			  
}

function downloadJson(filename, text) {
	var pom = document.createElement('a');
	pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	pom.setAttribute('download', filename);
	document.body.appendChild(pom);
	if (document.createEvent) {
		var event = document.createEvent('MouseEvents');
		event.initEvent('click', true, true);
		pom.dispatchEvent(event);
	}
	else {
		pom.click();
	}
	document.body.removeChild(pom);
}

function createPrivateKey() {
	return cryptico.generateRSAKey(new Date().toString(), 512);
}

function createPublicKeyID(privateKey) {
	var publicKey = cryptico.publicKeyString(privateKey); 
	return cryptico.publicKeyID(publicKey);
}

function loadKey(id = "key-field") {	
	client.publicKeyID = localStorage.getItem("publicKeyID");
	try {
		if(RSAKey) {
			client.privateKey = RSAKey.fromJSON(JSON.parse(localStorage.getItem("privateKey")));
		}
	} catch(e) {
		console.log('key not found.'+e);
	}
	var p = document.getElementById(id);		
	p.innerHTML = 'Key:'+((client.publicKeyID)?client.publicKeyID:'?');
}

function loadNodeName(id = 'node-field') {
	callGet('node/name', function(jsonResponse) {
		var name = jsonResponse.name;
		var element = document.getElementById(id);
		element.innerHTML = 'Node:'+name;
	});
}	

var client = new Client();
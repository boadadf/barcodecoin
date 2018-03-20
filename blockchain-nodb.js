var express = require('express');
var app = express();
var sha256 = require('js-sha256');
var bodyParser = require("body-parser");
var fs = require('fs');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var cryptico = require("cryptico-js");

cryptico.sign = function(plaintext, signingkey)
{
    var signString = cryptico.b16to64(signingkey.signString(plaintext, "sha256"));
    plaintext += "::52cee64bb3a38f6403386519a39ac91c::";
    plaintext += cryptico.publicKeyString(signingkey);
    plaintext += "::52cee64bb3a38f6403386519a39ac91c::";
    plaintext += signString;
    return plaintext;
}

cryptico.verify = function(plaintext)
{
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

var https = require('https');
var privateKey  = fs.readFileSync('key.pem', 'utf8');
var certificate = fs.readFileSync('cert.pem', 'utf8');
var uuidv4 = require('uuid/v4');
var nodeID = uuidv4();
var nconf = require('nconf').argv();
var cors = require('cors')
var HashMap = require('hashmap');
const Quagga = require('quagga').default;
var credentials = {key: privateKey, cert: certificate, passphrase: "dani23"};

function Blockchain() {
    this.chain = [];
    this.current_transactions = [];
	this.sender_message_map = new HashMap();
	//The first block is a barcode from a 'Hostess 5121 Twinkies Golden Sponge Cakes - Case Of 6'.
    this.newBlock('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOsAAACzCAYAAABo1+tPAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAPuSURBVHhe7d0BTttIAEDRZu9/Z7aDOtpRZOKQtUN++p4UYezJ2Hj4EKJKvXz89gt4ef/8+Qi8OLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRP/6fKV8ul8+P4zK2tqetfcO8/LPHT+uYrWPX+4Zb57o1fh7bOuc65tb4aT3P1nOnrXHT1vhhfc7wyPxz/73zb42/tW+ax8b+dbvAb1aIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFPi/VyuXw+gMc8JdY1UsHCY06Pdcb58fHx+RgEC993aqxrqJNg4THeYIIIsULE5ffL0v9eox5s62XwsO7/apvb3LfHlO/bqb9Z502YN2XwjQWPOf1l8BqsUOFxT/mbdY3zrFDnD4P1h8K1o8YMe8eHe+fYG3eWe877SmPm8b1x7+ppbzCNSM8MdVjPcb2YR40ZtvZdW8fcmmPvXGfZu77hnut51jxz30/dr1eQfzd4XcTpejGPGjOs219Z57o1x965zrJ3fcM91/Gsedbj01fne2f5WO9Z3KPGDGN7/fzaV88Z1rl/yr3XN/atY649c569Of4W+ViHdXG3Fn84aswR1vNM6zb7zlyfV/UWsa4LtxXCcNSYo6zzj8f8nH3rOv1NfjzWNYx1+15bCze357GjxhxtzD8f37U+79E5irbW6TvK9+0tfrO+krn4a+Bb32Bn/QDYc+/17fmJeR6Z/514g+kbY+61znVrjiPO9Yh7r2/PM+f5P/O/i1P/bfAzzcWctr6sI8ZcH59uzfXVLb7nes506/qO+jqPmOerOaatud7R28QK787frBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqyQ8OvXv+QtJcAexkphAAAAAElFTkSuQmCC', 1);
	this.nodes = new Set();
	this.loadNodes();
	this.privateKey=getPrivateKey();
	this.publicKeyID=getPublicKeyID(this.privateKey);
}

Blockchain.prototype = {
    newBlock: function(proof, previous_hash) {
		if(!proof) {
			throw 'invalid_proof';
		}
        var block = {
            'index': this.chain.length + 1,
            'timestamp': new Date(),
            'transactions': this.current_transactions,
            'proof': proof,
            'previous_hash': (previous_hash) ? previous_hash : hash(this.chain[-1]),
        }
		
        this.current_transactions = [];
        this.chain.push(block);
		notifyBlock(this.chain.length);
        return block;
    },
	addTransaction: function(sender, recipient, amount, timestamp = + new Date(), traveledNodes = []) {
		if (!sender || !recipient || !amount) {
			throw 'invalid_data';
		}
		if(amount=='all') {
			amount = blockchain.getBalance(sender);
		}
		
		var sendStatus = this.getSendStatus(sender, amount);
		if(sendStatus) {
			throw sendStatus;
		}

		var transaction = {
			'sender': sender,
			'recipient': recipient,
			'amount': amount,
			'timestamp':timestamp	
		};
		
		this.current_transactions.push(transaction);
		this.current_transactions.sort(function(a, b){
		  if(a.timestamp!=b.timestamp) {
			if(a.timestamp > b.timestamp) {
				return 1;
			} else {
				return -1;
			}
		  } else if (a.sender>b.sender){
			return 1;
		  } else {
			return -1;
		  }
		});
		
		return this.current_transactions.length;
	},
	addSignedTransaction(message) {
		var signedTransaction = message.transaction;		
		console.log('Signed: '+signedTransaction);
		var validatedResult = getValidatedMessage(signedTransaction);		
		var transactionJson = JSON.parse(validatedResult.plaintext);
		
		var sender = cryptico.publicKeyID(validatedResult.publicKeyString);
		var recipient = transactionJson["recipient"];
		var amount = transactionJson["amount"];
		var timestamp;
		if(!transactionJson["timestamp"]) {
			timestamp = transactionJson["timestamp"];
		} else {
			timestamp = + new Date();
		}
		
		var traveledNodes;
		if(!message.traveledNodes) {
			traveledNodes = [];
			//The transactions has origin in this node -> store it in case it gets orphan.
			this.sender_message_map.set(sender, message);
		} else {
			traveledNodes = JSON.parse(message.traveledNodes);
		}
		
		this.addTransaction(sender, recipient, amount, timestamp, traveledNodes);
		//An encrypted transaction comes from a client -> notify to other servers.
		notifyTransaction( signedTransaction, traveledNodes);
	},
    get last_chain() {
        return this.chain[this.chain.length - 1];
    },
	get mine_chain() {
	    return this.chain.slice(-100);
	},
    findPOW(lastPOW) {
        var proof = 0;
        while (!isValidPOW(lastPOW, proof)) {
            proof++;
        }
        return proof;
    },
	registerNode: function(address) {
		this.nodes.add(address);
		this.saveNodes();
	}, 
	checkValidChain: function(chain, callback) {
		var last_block = chain[0];
		var current_index = 1;
		var block = chain[current_index];
		
		var powCallBack = function(isValid) {		
			if(isValid) {
				last_block = block;
				current_index++;
				if(current_index<chain.length) {
					if(block['previous_hash']!=hash(last_block)) {				
						callback(false);
					}				
					checkPOW(last_block['proof'], block['proof'], this);
				} else {
					callback(true);
				}
			} else {
				callback(false);
			}
			
		};
		
		if(current_index<chain.length) {
			checkPOW(last_block['proof'], block['proof'], powCallBack);
		} else {
			callback(false);
		}
	},
	updateChain : function() {
		console.log('updateChain');
		var neighbours = this.nodes;
		var max_length = this.chain.length;
		var g = this;
		neighbours.forEach(function(item) {
			console.log('Calling :'+item);
			var httpResponse = httpGet(item+'/blockchain/list',
			function() {
				if (this.readyState == 4 && this.status == 200) {			
					var jsonResponse = JSON.parse(this.responseText);
					var length = jsonResponse['length'];
					var chain = jsonResponse['blockchain'];
					if(length > max_length) {
						g.checkValidChain(chain, function(isValid) {
							if(isValid) {
								max_length = length;
								new_chain = chain;
								g.chain = new_chain;
								//TODO notify again neighbours.
								g.addOrphanTransactions();
							}
						});					
					}
				}
			});
		});
	},
	/*
		Adds the encrypted transactions that were not included in the last block.
		Transactions from a sender included already in the last block are not added.
		This is case a sender attempted to add two transactions at the same time on different nodes.
	*/
	addOrphanTransactions: function() {
		var newTransactions = this.chain[this.chain.length-1];
		for(var i=0;i<newTransactions.length;i++) {
			var sender = newTransactions[i].sender;
			this.sender_message_map.delete(sender);
		}
		var orphanTransactions = this.sender_message_map.values();
		for(var i=0;i<orphanTransactions.length;i++) {
			var encryptedMessage = orphanTransactions[i];
			addEncryptedTransaction(encryptedMessage);
		}
		this.sender_message_map.clear();
	},	
	register: function() {
		var neighbours = this.nodes;		
		var data = {
			"nodes":[localURI]
		};
		var jsonData = JSON.stringify(data);
		neighbours.forEach(function(item) {
			console.log('call register on:'+item+'/nodes/register');
			httpPost(item+'/nodes/register',jsonData);
		});
	},
	loadNodes: function() {
		try {
			var configFileName = nconf.get('config');
			if(!configFileName) {
				configFileName= 'nodes.txt';
			}
			var array = fs.readFileSync(configFileName).toString().split("\n");
			for(var i=0;i<array.length;i++) {
				console.log('Defined node:'+array[i]);
				var node = array[i];
				if(node && node!='' && node.startsWith('https://')) {
					console.log('added '+node);
					this.nodes.add(node);
				}
			}
			console.log('Loaded nodes:'+JSON.stringify(Array.from(this.nodes)));
		} catch (err) {
			console.log('Node definition not found');
		}
	},
	saveNodes: function() {
		var file = fs.createWriteStream('nodes.txt');
		file.on('error', function(err) { /* Use error handler */ });
		this.nodes.forEach(function(item) { file.write(item + '\n'); });
		file.end();
	},
	getBalance: function(wallet_id) {
		var balance = 0;
		var last_block = this.chain[0];
		var current_block_index = 1;
		
		while(current_block_index<this.chain.length) {
			var block = this.chain[current_block_index];
			var transactions = block['transactions'];
			var current_transaction_index = 0;
			while(current_transaction_index<transactions.length) {
				var current_transaction = transactions[current_transaction_index];
					if(current_transaction.recipient==wallet_id) {
					balance += current_transaction.amount;
				} else if(current_transaction.sender==wallet_id) {
					balance -= current_transaction.amount;
				}
				current_transaction_index++;
			}
		
			current_block_index++;
		}
		return balance;
	},
	getBookedTransactions: function(wallet_id) {
		var ret = [];
		var last_block = this.chain[0];
		var current_block_index = 1;
		
		while(current_block_index<this.chain.length) {
			var block = this.chain[current_block_index];
			var transactions = block['transactions'];
			var current_transaction_index = 0;
			while(current_transaction_index<transactions.length) {
				var current_transaction = transactions[current_transaction_index];
				if(current_transaction.recipient==wallet_id || current_transaction.sender==wallet_id) {
					ret.push(current_transaction);
				} 
				current_transaction_index++;
			}		
			current_block_index++;
		}		
		return ret;		
	},
	getPendingTransactions: function(wallet_id) {
		var ret = [];
		var transactions = this.current_transactions;
		var current_transaction_index = 0;
		while(current_transaction_index<transactions.length) {
			var current_transaction = transactions[current_transaction_index];
			if(current_transaction.sender==wallet_id || current_transaction.recipient==wallet_id) {
				ret.push(current_transaction);
			} 
			current_transaction_index++;
		}
		return ret;		
	},
	getSendStatus: function(wallet_id, amount) {	
		if(wallet_id==0) {
			return null;
		}
		var transactions = this.current_transactions;
		var current_transaction_index = 0;
		while(current_transaction_index<transactions.length) {
			var current_transaction = transactions[current_transaction_index];
			if(current_transaction.sender==wallet_id) {
				return 'has_pending_transaction';
			} 
			current_transaction_index++;
		}
		if(wallet_id!=0) {
			var balance = this.getBalance(wallet_id);
			console.log('balance '+balance+' wallet '+wallet_id+'  amount '+amount );
			if(amount>balance) {
				return 'has_no_enough_funds';
			}
		}
		return null;		
	}
}

function getPOW(barcode_image, callback) {

	Quagga.decodeSingle({
		locate: true, // try to locate the barcode in the image
		src: barcode_image,
		numOfWorkers: 0,  // Needs to be 0 when used within node
		locator: {
                patchSize: "x-large",
                halfSample: false
				},
				inputStream: {
                size: 800
				},
		decoder: {
			readers: ["ean_reader"] // List of active readers
		},
	}, function(result) {
		if(result.codeResult) {
			callback(result.codeResult.code);
		} else {
			console.log("not detected");
			callback(null);
		}
	});
}

//Hashes a block
function hash(block) {
    var block_string = JSON.stringify(block);
    return sha256(block_string);
}

function checkPOW(last_image, next_image, callback) {
	getPOW(last_image,(last_proof)=>{		
		if(last_proof) {
		console.log('call next:'+last_image);
			getPOW(next_image,(next_proof)=>{
				if(next_proof) {
					var guess = last_proof+''+ next_proof;
					var guessHash = sha256(guess);
					callback(guessHash.endsWith("0"));					
				} else {
					callback(false);
				}
			});		
		} else {
			callback(false);
		}
	});
}

function httpGet(theUrl, callback) {
	console.log('Get:'+theUrl);
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); // false for synchronous request
    xmlHttp.timeout = 2000;
	if(callback) {
		xmlHttp.onreadystatechange = callback;
	}
	xmlHttp.onerror = function(e) {
    console.log("Error Status: " + xmlHttp.statusText);
};
	xmlHttp.send( null );
    return xmlHttp;
}
function httpPost(theUrl,theData) {
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", theUrl, true);
	xmlHttp.timeout = 2000;
	xmlHttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");	
	xmlHttp.send(theData); 
}

function getPublicKeyID(privateKey) {
        var publicKey = cryptico.publicKeyString(privateKey);  
		return cryptico.publicKeyID(publicKey);
}

function getPrivateKey() {
		var PassPhrase = "Twinkies";
        var Bits = 512;
        return cryptico.generateRSAKey(PassPhrase, Bits);
}

function getValidatedMessage(signedMessage) {
	var verified = cryptico.verify(signedMessage);
	if(verified.signature!='verified') {
		throw 'error_verifying';
	}
	return verified;
}

function notifyBlock(index) {
	console.log(index);
	if(index<=1) {
		return;	
	}
	console.log(blockchain.nodes);
	var neighbours = blockchain.nodes;
	neighbours.forEach(function(item) {
		httpGet(item+'/blockchain/update');
	});
}

function notifyTransaction(signedMessage, traveledNodes) {
	var neighbours = blockchain.nodes;	
	var message = 'message='+signedMessage+'&traveledNodes='+JSON.stringify(traveledNodes);
	neighbours.forEach(function(item) {
		if(traveledNodes.indexOf(item) == -1) {
			httpPost(item+'/transactionNew',message);
		}		
	});
}

var blockchain = new Blockchain();

app.use(express.static(__dirname + '/www'));
console.log(__dirname);

//To use POST, configure express to use body-parser as middle-ware.
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

//Add CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/blockchain/update', function(request, response) {
   blockchain.updateChain();
   //Make asynchronous
   var replaced;
   var ret;
   if(replaced) {
	ret = {
		'message': 'Our chain was replaced',
		'new_chain': blockchain.chain};
   } else {
	   ret = {
			'message': 'Our chain is authoritative',
			'chain': blockchain.chain};
	}
	response.status(200);		
	response.send('');
});

app.get('/blockchain/list', function (request, response, next) {
		console.log('Called chain.');
        var ret = {
            'blockchain': blockchain.chain,
            'length': blockchain.chain.length
        }
        response.status(200);
        response.json(ret);
});

app.get('/blockchain/last', function (request, response, next) {
        var ret = {block:blockchain.chain[blockchain.chain.length-1]};
        response.status(200);
        response.json(ret);
});

app.get('/nodes/list', function(request, response) {
		var nodeArray = Array.from(blockchain.nodes);
        response.status(200);
        response.json(nodeArray);
});

app.get('/balance', function(request, response) {
	var wallet_id = request.query.wallet_id;
	console.log('balance for:'+wallet_id);
	var balance = Number(blockchain.getBalance(wallet_id));		
	if(blockchain.getPendingTransactions(wallet_id).length>0) {
		balance += '*';
	}
	var ret = {
		'balance': balance
	};
	console.log('balance:'+balance);
	response.status(200);
	response.json(ret);
});

app.get('/transactions', function(request, response) {
		var wallet_id = request.query.wallet_id;		
		var ret = {'booked':blockchain.getBookedTransactions(wallet_id),'pending':blockchain.getPendingTransactions(wallet_id)};		
        response.status(200);
        response.json(ret);
});

app.get('/publicKeyID', function(request, response) {
        var ret = {
            'publicKeyID': blockchain.publicKeyID
        };
        response.status(200);
        response.json(ret);
});

app.post('/mine', function(request, response) {
	console.log('mine new coins');
	console.log('received:'+JSON.stringify(request.body.message));
	var jsonRequest = JSON.parse(request.body.message);

	var barcode_image = jsonRequest["barcode_image"];
	
    var last_block = blockchain.last_chain;
    var last_image = last_block['proof'];	

	
	if(!barcode_image) {
		var ret = {
			'message': "wrong_token"};
		response.status(200);
		response.json(ret);			
		return;
	}	
	
	checkPOW(last_image, barcode_image, (isAlive) => {
		if(isAlive) {
			var wallet_id = jsonRequest["wallet_id"];
			blockchain.addTransaction(
				sender = "0",
				recipient = wallet_id,
				amount = 25);
			var previous_hash = hash(last_block);
			var block = blockchain.newBlock(barcode_image, previous_hash);

			var ret = {
				'message': "ok",
				'index': block['index'],
				'transactions': block['transactions'],
				'proof': block['proof'],
				'previous_hash': block['previous_hash'],
			};
			response.status(200);
			response.json(ret);				
		} else {
			var ret = {
				'message': "wrong_token"};
			response.status(200);
			response.json(ret);			
			return;
		}
	});	
});

app.get('/mine/fundproject', function(request, response) {
	console.log('mine new coins');
    var last_block = blockchain.last_chain;
    var last_proof = last_block['proof'];
    var proof = blockchain.findPOW(last_proof);

    blockchain.addTransaction(
        sender = "0",
        recipient = "aK3q7EmI0jg3QL7R2IHB+xLkynsRPge78TCMbcjPXWsWW832SSiL5aOc+z/WDGwxpXOAeJlAlg+NTl0rEauRIw==",
        amount = 25
    );

    var previous_hash = hash(last_block);
    var block = blockchain.newBlock(proof, previous_hash);
	console.log('done');
    var ret = {
        'message': "New Block Forged",
        'index': block['index'],
        'transactions': block['transactions'],
        'proof': block['proof'],
        'previous_hash': block['previous_hash'],
    }
    response.status(200);
    response.json(ret);
});

app.post('/transactions/new', function(request, response) {
 	try {
		var message = request.body;
		console.log(message);
		var index = blockchain.addSignedTransaction(message);
		var ret = {
			'message': 'accepted_on_'+index
		};
		response.status(201);
		response.json(ret);
		console.log('ok');
	} catch(e) {
		console.log(e);
		var ret = {
			'message': e
		}
		response.status(400);
		response.json(ret);
	}
});

app.post('/nodes/register', function(request, response) {
    var nodes = request.body.nodes;

    if(!nodes) {
		response.status(400);
        response.send('Error: Please supply a valid list of nodes');
        return;
	}
	
	for(var i=0;i<nodes.length;i++) {
		var node = nodes[i];
		console.log('registering:'+node);
		blockchain.registerNode(node);
	}
	
	var ret = {
        'message': 'New nodes have been added',
        'total_nodes': blockchain.nodes.length
	};
	
	response.status(201);
        response.json(ret);
        return;
	
});

var port = nconf.get('port');
var hostname = nconf.get('hostname');
var localURI = "https://"+hostname+":"+port;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var server = https.createServer(credentials, app).listen(port, hostname, function() {
    console.log('Server running at %s', localURI);
	blockchain.register();
	blockchain.updateChain();
});
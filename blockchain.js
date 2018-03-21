var express = require('express');
var app = express();
var sha256 = require('js-sha256');
var bodyParser = require("body-parser");
var fs = require('fs');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var cryptico = require("cryptico-js");

cryptico.verify = function(plaintext) {
    plaintext = plaintext.split("::52cee64bb3a38f6403386519a39ac91c::");
    if(plaintext.length == 3)
    {
    	console.log('publickey:'+plaintext[1]);
	console.log('signature:'+plaintext[2]);
	console.log('text:'+plaintext[0]);
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
var cors = require('cors')
var HashMap = require('hashmap');
const Quagga = require('quagga').default;
var credentials = {key: privateKey, cert: certificate, passphrase: "dani23"};

function Blockchain(inName) {
    this.current_transactions = [];
    this.sender_message_map = new HashMap();	
    this.privateKey=getPrivateKey();
    this.publicKeyID=getPublicKeyID(this.privateKey);
    this.lastId;
    this.lastBlock;
    this.name = inName;
}

function Node(inUrl, inName) {
	this.url = inUrl;
	this.name = inName;
	this.status = true;
}

Blockchain.prototype = {
    newBlock: function(proof,transactions, callback) {
	console.log('newBlock');
	if(!proof) {
		throw 'invalid_proof';
	}
	var g = this;
	var nextId = getNextId(this.lastId);
	console.log('nextId:'+nextId);
	if(!transactions) {
		transactions = [];
	}
        var block = {
            'index': nextId,
            'timestamp': new Date(),
            'transactions': transactions,
            'proof': proof,
            'previous_hash': (this.lastId) ? hash(this.lastBlock) : 1,
	    'node':NAME
        }
        this.includeBlock(block, function() {
		if(Number(g.lastId)>1) {
		    notifyBlock(null, callback);
		}
	});
	
       
    },
    includeBlock(block, callback) {
	var stringBlock = JSON.stringify(block);
	console.log(stringBlock);
	var g = this;
        persistence.put(block.index, stringBlock, function() {
		g.lastBlock = block;	        
		//remove added transactions.
		g.current_transactions = g.current_transactions.filter( function( el ) {
		  return block.transactions.indexOf( el ) < 0;
		} );
		
		for(i = 0; i < g.current_transactions.length; i++) {
		    for(j = 0; j < block.transactions.length; j++) {
			if(g.current_transactions[i].timestamp === block.transactions[j].timestamp && 
				g.current_transactions[i].amount === block.transactions[j].amount && 
					g.current_transactions[i].sender === block.transactions[j].sender && 
						g.current_transactions[i].recipient === block.transactions[j].recipient) {
			    g.current_transactions.splice(i, 1);
			}
		    }
		}
		console.log('Remaining transactions:'+JSON.stringify(g.current_transactions));
		g.lastId = block.index;
		console.log('storing lastid:'+block.index);
		persistence.put('lastId', block.index, function() {
			console.log('storing last block');
			persistence.put('lastBlock', stringBlock, callback);  
		});
	});
    },
	addTransaction(sender, message) {

		var traveledNodes;
		if(!message.traveledNodes) {
			traveledNodes = [];
			//The transactions has origin in this node -> store it in case it gets orphan.
			this.sender_message_map.set(sender, message);
		} else {
			traveledNodes = JSON.parse(message.traveledNodes);
		}
		
		this.current_transactions.push(message);
		//An encrypted transaction comes from a client -> notify to other servers.
		notifyTransaction( message, traveledNodes);
		
	},
	validateTransaction: function(transaction, callback) {
		var validated = cryptico.verify(transaction);
		if(validated.signature!='verified') {
			callback( 'transaction_'+validated.signature);
			return;
		}
		var transactionJson = JSON.parse(validated.plaintext);
		
		var sender = transactionJson["sender"];
		var recipient = transactionJson["recipient"];
		var amount = transactionJson["amount"];
		var timestamp = transactionJson["timestamp"];

		if (sender === undefined || recipient === undefined || amount === undefined) {
			console.log('sender:'+sender);
			console.log('recipient:'+recipient);
			console.log('amount:'+amount);
			callback(  'transaction_invalid_data');
			return;
		}
		if(amount < 0) {
			callback('transaction_negative_amount');
			return;
		}
		if(sender!=0 && sender!=cryptico.publicKeyID(validated.publicKeyString)) {
			callback('fail_sender_not_signer');
		}
		if(sender==0 && amount!=25) {
			callback( 'fail_reward_amount_'+amount);
			return;
		} 

		var transactions = this.current_transactions;
		var current_transaction_index = 0;
		while(current_transaction_index<transactions.length) {
			var verifiedTransaction = cryptico.verify(transactions[current_transaction_index]);
			var transaction = JSON.parse(verifiedTransaction.plaintext);
			if(verifiedTransaction.plaintext!=validated.plaintext && transaction.sender==sender) {
				callback('transaction_double_spending');
				return;
			} 
			current_transaction_index++;
		}

		if(sender==0) {
			callback('', sender);
		} else {
			this.getBalance(sender, function(balance) {
				console.log('balance '+balance+' wallet '+sender+'  amount '+amount );
				if(amount>balance) {
					callback( 'has_no_enough_funds');
				} else {
					callback('', sender);
				}
			});			
		}	
	},
    get last_chain() {
        return this.lastBlock;
    },    
	registerNode: function(remoteURL, callback) {
	console.log('registerin to:'+remoteURL);		
		var g = this;
		var findNewNodes = function(remoteURL, localNodes, callback) {	
			console.log('findNewNodes on:'+remoteURL);
			g.getRemoteNodes(remoteURL, function(remoteNodes) {				
				var newNodes = [];
				for(var j=0;j<remoteNodes.length;j++) {
					console.log('j:'+j+'   '+ remoteNodes[j].url);
					var remoteNode = remoteNodes[j];
					var found = false;
					for (var i=localNodes.length-1;i >= 0; i--){
						var testNode = localNodes[i];
						console.log('Compare:'+remoteNode.url +'  '+ testNode.url +'  '+ remoteNode.name +'  '+ testNode.name);
						if (remoteNode.url == testNode.url && remoteNode.name == testNode.name) {
							found = true;
							break;
						}
					}
					if(!found) {
						console.log('Not found:'+remoteNode.url);
						newNodes.push(remoteNode);
					} else {
						console.log('Found');
					}				
				}
				callback(newNodes);
			});			
		};
		
		var handleNodes = function(remoteNodes, localNodes, callback) {	
			console.log('handleNodes');
			var index = 0;
			var addNextNode = function() {
				if(index<remoteNodes.length) {
					var remoteNode = remoteNodes[index++];
					addNode(remoteNode, localNodes, addNextNode);
				} else if (callback) {
					callback();
				}
			}
			addNextNode();
		};
		
		var addNode = function(remoteNode, localNodes, callback) {
			localNodes.push(remoteNode);
			g.storeNodes(localNodes,function(){
				console.log('Stored nodes:'+JSON.stringify(localNodes));
				g.updateChain(remoteNode.url, function() {
					console.log('Chain updated');
					findNewNodes(remoteNode.url, localNodes, function(remoteNodes) {
						//If the remote node doesn't contain the local node call to register, otherwise skip.
						var found = false;
						for (var i=remoteNodes.length-1;i>=0;i--){
							var testNode = remoteNodes[i];
							console.log('checking:'+testNode.url +' vs. '+ remoteNode.url);
							if (testNode.url == remoteNode.url || testNode.url == localURI) {
								remoteNodes.splice(i,1);
								found = true;
								break;
							}
						}
						if(!found) {
							console.log('remote node doesn not contain local node -> register');
							g.registerLocalInRemoteNode(remoteNode.url);
						} else {
							console.log('Nothing to do');
						}
						if(remoteNodes.length>0) {
							handleNodes(remoteNodes, localNodes, callback);	
						} else {
							if(callback) {							
								callback();
							} else {
								return;
							}
						}						
					});
				});
			});			
		};
			
	
		g.getRemoteName(remoteURL, function(remoteName){
				var remoteNode = new Node(remoteURL, remoteName);
				g.getLocalNodes(function(localNodes) {
				var found = false;			
				for (var i=localNodes.length-1;i >= 0; i--){
					var testNode = localNodes[i];
					if(testNode.url == remoteURL) {
						if(testNode.name == NAME) {
							found = true;
							break;
						} else {
							localNodes.splice(i,1);
						}
					} 
				}
				if(!found) {
					console.log('Not found');
					addNode(remoteNode, localNodes);
				} else {
					console.log('Found');
					findNewNodes(remoteNode.url, localNodes, function(remoteNodes) {
						handleNodes(remoteNodes, localNodes);
					});
				}
			});
		}, function() {
			console.log('Error getting name, cannot register');
		});
	
	},
	registerLocalInRemoteNode : function(remoteURL) {		
		var message =  {'url':localURI};
		httpPost(remoteURL+'/nodes/register', JSON.stringify(message));
	},
	getRemoteNodes : function(remoteURL, callback) {
		httpGet(remoteURL+'/nodes/list', function(data) {
				console.log('Received:'+data);
				var remoteNodes = JSON.parse(data).nodes;
				console.log('remote nodes:'+data);
				callback(remoteNodes);
		});
	},
	storeNodes : function(nodes, callback) {
		persistence.put('nodes', JSON.stringify(nodes),function() {					
			callback();						
		});
	},
	getRemoteName : function(remoteURL, callback, errorcallback) {
		console.log('Asking name for:'+remoteURL);
		httpGet(remoteURL+'/node/name', function(response) {
			var name = JSON.parse(response).name;
			console.log('The name is:'+name);
			callback(name);			
		}, function() {
			console.log('cannot contact with:'+remoteURL);
			if(errorcallback) {
				errorcallback();
			}
		});
	},
	getLocalNodes : function(callback) {
		console.log('getLocalNodes');
		persistence.get('nodes', function(err,data) {
			var nodes;
			if(data) {			
				nodes = JSON.parse(data);
			} else {
				nodes = [];
			}
			console.log('Nodes:'+JSON.stringify(nodes));
			callback(nodes);
		});
	},
	checkValidChain: function(chain, callback) {
		console.log('Checking if chain is valid.');
		var current_index = 0;
		
		var powCallBack = function(isValid) {	
			console.log('Remote chain is valid so far:'+isValid+'  index:'+current_index);		
			if(isValid) {				
				if(current_index+1<chain.length) {					
					var last_block = chain[current_index++];
					var block = chain[current_index++];
					if(block['previous_hash']!=hash(last_block)) {				
						callback(false);
						return;
					}				
					checkPOW(last_block['proof'], block['proof'], powCallBack);
				} else {
					console.log('Final remote chain is valid:'+isValid);	
					callback(true);
					return;
				}
			} else {
				callback(false);
				return;
			}
			
		};
		powCallBack(chain.length>1);
	},
	updateChain : function(url, callback) {
		console.log('updateChain');		
		var max_length = Number(this.lastId);
		var g = this;
		
		console.log('Calling :'+url);
		var httpResponse = httpGet(url+'/blockchain/list',
		function(responseText) {							
			var blockchain = JSON.parse(responseText);
			var length = blockchain.length;
			if(length > max_length) {
				g.checkValidChain(blockchain, function(isBetter) {
					if(isBetter) {
						g.replaceChain(blockchain, function() {
							notifyBlock(url);
							callback(true);
						});																	
					} else {
						callback(false);
					}
				});					
			} else {
				callback(false);	
			}			
		}, function () {
			console.log('cannot contact with:'+url);
			g.deleteNode(url);
			callback(false);
		});
		
	},
	deleteNode(address) {
		console.log('deleting:'+address);
		persistence.get('nodes', function(err,data) {			
			
			if(data) {
				var nodes = JSON.parse(data);
				console.log('got:'+data);
				var index,i;
				for (i=nodes.length-1;i >= 0; i--){
					var node = nodes[i];
					if(node.url == address) {
						console.log('found');
						nodes.splice(i, 1);
						break;
					}
				}			
				console.log('saving:'+JSON.stringify(nodes));
				persistence.put('nodes', JSON.stringify(nodes));
			} 	
		});
	},
	replaceChain(otherChain, callback) {
		if(!otherChain || otherChain.length==0) {
			callback();
		}
		this.lastId = null;
		var g = this;
		var index = 0;
		var replaceBlock = function() {
			if(index<otherChain.length) {
				g.includeBlock(otherChain[index++], replaceBlock);
			} else {
				callback();
			}
		}
		replaceBlock();
	},

	getBalance: function(wallet_id, callback) {
		var balance = 0;
		var index = 0;
		var last_reward = 0;
		persistence.createReadStream()
		  .on('data', function (data) {
		    if(Number(data.key)) {
		    
		       var block = JSON.parse(data.value);
			var transactions = block.transactions;
			var current_transaction_index = 0;
			while(current_transaction_index<transactions.length) {	
				var verifiedTransaction = cryptico.verify(transactions[current_transaction_index]);
				var transaction = JSON.parse(verifiedTransaction.plaintext);
				if(transaction.recipient==wallet_id) {
					balance += Number(transaction.amount);
				} else if(transaction.sender==wallet_id) {
					balance -= Number(transaction.amount);
				}
				current_transaction_index++;
			}
			index++;
		    }
		  })
		  .on('error', function (err) {
		    console.log('Oh my!', err);
		  })
		  .on('close', function () {
		    console.log('Stream closed');
		  })
		  .on('end', function () {
		   callback(balance);
		  });		
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
				var verifiedTransaction = cryptico.verify(transactions[current_transaction_index]);
				var transaction = JSON.parse(verifiedTransaction.plaintext);
				if(transaction.recipient==wallet_id || transaction.sender==wallet_id) {
					ret.push(transaction);
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
			var verifiedTransaction = cryptico.verify(transactions[current_transaction_index]);
			var transaction = JSON.parse(verifiedTransaction.plaintext);
			if(transaction.sender==wallet_id || transaction.recipient==wallet_id) {
				ret.push(transaction);
			} 
			current_transaction_index++;
		}
		return ret;		
	}
}

function getPOW(barcode_image, callback) {
	console.log('Get POW');
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
			console.log('POW = '+result.codeResult.code);
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

function getNextId(lastId) {
    return getId((lastId)?Number(++lastId):1);
}

function getId(id) {
    var retId = '0000000000'+id;
    return retId.substring(retId.length-10);
}

function checkPOW(last_image, next_image, callback) {
	console.log('Checking POW');
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

function httpGet(theUrl, callback, errorcallback) {
	console.log('Get:'+theUrl);
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); // false for synchronous request
    xmlHttp.timeout = 2000;
	if(callback) {
		xmlHttp.onreadystatechange = function() {//Call a function when the state changes.
		    if(xmlHttp.readyState == xmlHttp.DONE && xmlHttp.status == 200) {
		        console.log('Response:'+xmlHttp.responseText);
			callback(xmlHttp.responseText);
		    }
		}	
	}
	if(errorcallback) {
		xmlHttp.onerror = function(e) {
		    errorcallback(xmlHttp.statusText);
		};
	} else {
		xmlHttp.onerror = function(e) {
		    console.log("Error Status: " + xmlHttp.statusText);
		};
	}
	xmlHttp.send( null );
    return xmlHttp;
}
function httpPost(theUrl,theData, callback, errorcallback) {
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("POST", theUrl, true);
	xmlHttp.timeout = 2000;
	xmlHttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	if(callback) {
		xmlHttp.onreadystatechange = function() {//Call a function when the state changes.
		    if(xmlHttp.readyState == XMLHttpRequest.DONE && xmlHttp.status == 200) {
			console.log('received:'+xmlHttp.response);
			callback(xmlHttp.responseText);
		    }
		}	
	}
	if(errorcallback) {
		xmlHttp.ontimeout = function() {
			errorcallback(xmlHttp.statusText);
		};
		xmlHttp.onerror = function(e) {
		    errorcallback(xmlHttp.statusText);
		};
	}
	console.log('POST:'+theUrl+'  '+theData);
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

function notifyBlock(url, callback) {
	console.log('Notify block.');
	persistence.get('nodes', function(err,data) {	
		if(data) {
			var nodes = JSON.parse(data);
			console.log('Remote nodes:'+data);
			nodes.forEach(function(node) {				
				if(node.url!=url) {
					console.log('Notifying:'+node.url);
					httpGet(node.url+'/blockchain/update?url='+encodeURIComponent(localURI));
				}
			});			
		}
		if(callback) {
			callback();
		}
	});
}

function notifyTransaction(signedMessage, traveledNodes) {
	
	var message = 'message='+signedMessage+'&traveledNodes='+JSON.stringify(traveledNodes);
	persistence.get('nodes', function(err,data) {	
		if(data) {
			var nodes = JSON.parse(data);
			nodes.forEach(function(node) {
			var url = node.url;
			if(traveledNodes.indexOf(url) == -1) {
				httpPost(url+'/transaction/new',message);
			}		
		});
	}
	});
}

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
	   var url = request.query.url;
	   blockchain.updateChain(url, function(replaced) {
	   console.log('Is replaced:'+replaced);
	   //Make asynchronous
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
	return;
   });
   
});

app.get('/blockchain/lastproof', function (request, response, next) {
        var ret = {proof:blockchain.lastBlock.proof};
        response.status(200);
        response.json(ret);
});

app.get('/transactions/list', function(request, response) {		
	var ret = {'transactions':blockchain.current_transactions};	
	console.log('return transactions:'+JSON.stringify(blockchain.current_transactions));
	response.status(200);
        response.json(ret);
});

app.get('/blockchain/list', function(request, response) {		
console.log('Getting block chain');
	var blocks = [];
	persistence.createReadStream()
		  .on('data', function (data) {
		    if(Number(data.key)) {		    
		       var block = JSON.parse(data.value);
			blocks.push(block);
		    }
		  })
		  .on('error', function (err) {
		    console.log('Oh my!', err);
		  })
		  .on('close', function () {
		    console.log('Stream closed');
		  })
		  .on('end', function () {
		   	response.status(200);
			response.json(blocks);
		  });	
});

app.get('/nodes/list', function(request, response) {
console.log('Getting node list');
	persistence.get('nodes', function(err,data) {
		var nodes = (data)?JSON.parse(data):[];
		response.status(200);
		response.json({'nodes':nodes});
		return;
	});        
});

app.get('/blockchain/length', function(request, response) {
	console.log('return value:'+Number(blockchain.lastId));
	response.status(200);
	response.json({'length':Number(blockchain.lastId)});
	return;
});

app.get('/node/name', function(request, response) {
	response.status(200);
	response.json({'name':blockchain.name});
	return;
});

app.get('/blockchain', function(request, response) {
	var index = request.query.index;
	var id = getId(index);
	console.log('request index:'+index+'   '+id);
	persistence.get(id, function(err,data) {		
		if(data) {
			console.log('return:'+data);
			data.status = 'ok';
			response.status(200);
			response.json(data);
			return;
		} else {
			response.status(200);
			response.json({'status':'error'});
		}
	});
	
        
});

app.get('/balance', function(request, response) {
	var wallet_id = request.query.wallet_id;
	console.log('balance for:'+wallet_id);
	blockchain.getBalance(wallet_id, function(balance) {
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
	
});

app.get('/publicKeyID', function(request, response) {
        var ret = {
            'publicKeyID': blockchain.publicKeyID
        };
        response.status(200);
        response.json(ret);
});

app.post('/mine', function(request, response) {
	console.log('mine new coins:'+request.body.message);
	var jsonRequest = JSON.parse(decodeURIComponent(request.body.message));

	var barcode_image = jsonRequest["barcode_image"];
	var transactions = jsonRequest["transactions"];
	
        var last_block = blockchain.last_chain;
        var last_image = last_block['proof'];
	
	if(!barcode_image) {
		var ret = {
			'message': "cannot_decode_image"};
		response.status(200);
		response.json(ret);			
		return;
	}
	console.log('validate transactions');
	var powCheckListener = function(isValid) {
		if(isValid) {
			var wallet_id = jsonRequest["wallet_id"];
			try {
				var block = blockchain.newBlock(barcode_image, transactions, function() {
					var ret = {'message': "ok"};
					response.status(200);
					response.json(ret);
				}, function(e) {
					var ret = {'message': e};
					response.status(200);
					response.json(ret);	
				});			
			
			} catch(e) {
				var ret = {'message': e};
				response.status(200);
				response.json(ret);			
			}
			return;
		} else {
			var ret = {'message': "wrong_token"};
			response.status(200);
			response.json(ret);			
			return;
		}
	};
	
	if(transactions.length>0) {
	transactions.forEach(function (transaction, index, ar) {
		try {
			blockchain.validateTransaction(transaction, function(status) {
				console.log('validated transaction:'+status);
				if(status!='') {
					var ret = {'message': status};
						response.status(200);
						response.json(ret);			
						return;
				}
				console.log(index+'//'+ar.length);
				if (index == ar.length-1) {
				console.log('checkPOW');
				checkPOW(last_image, barcode_image, powCheckListener);
				}
			});	
		} catch(e) {
			console.log('Error:'+e);
			var ret = {
				'message': e};
			response.status(200);
			response.json(ret);			
			return;
		}
	});
	} else {
		checkPOW(last_image, barcode_image, powCheckListener);
	}
});

app.post('/transactions/new', function(request, response) {
	console.log(request.body.message);
	var transaction = decodeURIComponent(request.body.message);
	blockchain.validateTransaction(transaction, function(status, sender) {
		console.log('validated transaction:'+status);
		if(status!='') {
			var ret = {'message': status};
				response.status(400);
				response.json(ret);			
				return;
		} else {
			blockchain.addTransaction(sender, transaction);
			var ret = {
			'message': 'accepted'
			};
			response.status(201);
			response.json(ret);
		}
		
	});
	
});

app.post('/nodes/register', function(request, response) {
	
        var url = request.body.url;
	blockchain.registerNode(url, function() {
		response.status(201);
		return;
	});
	
	
});

var PORT = process.env.OPENSHIFT_NODEJS_PORT || 443;
var IPADDRESS = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
var localURI = "https://"+IPADDRESS+":"+PORT;
var REGISTER = process.env.OPENSHIFT_NODEJS_REGISTER_TO || '127.0.0.1:8443';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var server;

var persistence;
var NAME = process.env.OPENSHIFT_NODEJS_NAME || 'edu';
var level = require('level');
var initFunctions = [];
var blockchain = new Blockchain(NAME);


initFunctions.push(startServer);
initFunctions.push(loadDb);
initFunctions.push(loadLastId);
initFunctions.push(loadLastBlock);
initFunctions.push(loadNodes);
initFunctions.push(loadChains);

var initCounter = 0;
initNext();

function initNext() {
	console.log('initNext');
	if(initCounter<initFunctions.length) {
		initFunctions[initCounter++](function () {
			initNext();
		});
	} 
}

function startServer(callback) {
	console.log('starting server...');
	server = https.createServer(credentials, app).listen(PORT, IPADDRESS, function() {
	    console.log('Server running at %s', localURI);
	    console.log('...done starting server');
	    callback();
	});
}

function loadNodes(callback) {
	console.log('loading nodes...');
	
	console.log('register to:'+REGISTER);
	if(REGISTER) {		
		blockchain.registerNode(REGISTER, function() {
			console.log('...done loading nodes');
			callback();
		});
	} else {
		console.log('...done loading nodes');
		callback();
	}
}

function loadLastId(callback) {	
	console.log('loading lastid...');
	persistence.get('lastId', function(err,data) {		
		if(data) {
			console.log('setLastId:'+data);
			blockchain.lastId = data;	
			
		} else {	
			console.log('cannot find lastid, creating first block');
			blockchain.newBlock('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOsAAACzCAYAAABo1+tPAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAPuSURBVHhe7d0BTttIAEDRZu9/Z7aDOtpRZOKQtUN++p4UYezJ2Hj4EKJKvXz89gt4ef/8+Qi8OLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRP/6fKV8ul8+P4zK2tqetfcO8/LPHT+uYrWPX+4Zb57o1fh7bOuc65tb4aT3P1nOnrXHT1vhhfc7wyPxz/73zb42/tW+ax8b+dbvAb1aIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFPi/VyuXw+gMc8JdY1UsHCY06Pdcb58fHx+RgEC993aqxrqJNg4THeYIIIsULE5ffL0v9eox5s62XwsO7/apvb3LfHlO/bqb9Z502YN2XwjQWPOf1l8BqsUOFxT/mbdY3zrFDnD4P1h8K1o8YMe8eHe+fYG3eWe877SmPm8b1x7+ppbzCNSM8MdVjPcb2YR40ZtvZdW8fcmmPvXGfZu77hnut51jxz30/dr1eQfzd4XcTpejGPGjOs219Z57o1x965zrJ3fcM91/Gsedbj01fne2f5WO9Z3KPGDGN7/fzaV88Z1rl/yr3XN/atY649c569Of4W+ViHdXG3Fn84aswR1vNM6zb7zlyfV/UWsa4LtxXCcNSYo6zzj8f8nH3rOv1NfjzWNYx1+15bCze357GjxhxtzD8f37U+79E5irbW6TvK9+0tfrO+krn4a+Bb32Bn/QDYc+/17fmJeR6Z/514g+kbY+61znVrjiPO9Yh7r2/PM+f5P/O/i1P/bfAzzcWctr6sI8ZcH59uzfXVLb7nes506/qO+jqPmOerOaatud7R28QK787frBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqwQIVaIECtEiBUixAoRYoUIsUKEWCFCrBAhVogQK0SIFSLEChFihQixQoRYIUKsECFWiBArRIgVIsQKEWKFCLFChFghQqyQ8OvXv+QtJcAexkphAAAAAElFTkSuQmCC');
			initCounter++;
		}
		console.log('...done loading lastid');
		callback();
	});			
		
}	
function loadLastBlock(callback) {
	console.log('loading last block...');
	persistence.get('lastBlock', function(err,data) {
		if(data) {
			console.log('last block:'+data);
			blockchain.lastBlock = JSON.parse(data);	
			console.log('...done loading last block');
			callback();			
		} else {
			throw 'Cannot load last block';
		}
	});
}

function loadDb(callback) {
    console.log('...loading db');
    persistence = level('./'+NAME, function() {
    console.log('...done loading db');
    callback();
    });
}

function loadChains() {
    console.log('loading chains...');
    persistence.get('nodes', function(err, data){
	if(data) {
		var nodes = JSON.parse(data);
		nodes.forEach(function(node) {
			console.log('Updating from:'+node.url);
			blockchain.updateChain(node.url);		
		});
	}
	console.log('...done loading chains');
    });    
}
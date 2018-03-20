var App;
var code;
var barcode_image;
var columnId = 0;
var showResult = false;

function init() {
	loadKey();
	loadNodeName('node-field');
	jQuery("#list4").jqGrid({ datatype: "local", shrinktofit:false, autowidth: true, height: 250, multiselect: true, colNames:['Id','Transaction', 'data'],
	colModel:[ {name:'id',index:'id', width:60, sorttype:"int", align:"left"}, {name:'transaction',index:'transaction', align:"left"},{name:'data',index:'data', hidden:true}],
	caption: "Transaction list" , afterInsertRow: function(rowid, rowdata, rowelem) {
	    $(this).jqGrid('setSelection', rowid, rowdata.verified);
	}});
	loadData();
}

function loadData() {
console.log('Loading data.....');
	columnId = 0;
	jQuery("#list4").jqGrid('clearGridData');
	try {
		client.loadLastProof(proofDecoder);
		client.loadTransactions(verifyTransactions);		
	} catch (e) {
		alert('Cannot load last proof'+e);
	}
}

function addTransaction(transaction) {		
	var row = 
		 {"id":columnId++, "transaction":"Sender: " + (transaction.sender=="0" ? "New coined." : transaction.sender) + "\n"
		 + "Recipient: " + transaction.recipient + "\n"
		 + "Amount: " + transaction.amount + "\n"
		 + "Timestamp: " + new Date(transaction.timestamp).toGMTString(), "data":transaction.transaction};	
	jQuery("#list4").jqGrid('addRowData',columnId, row);
}

function verifyTransactions(data) {
	var senders = [];
	$.each(data, function (index, item) {
		var verifiedTransaction = cryptico.verify(item);
		
		//verify balance
		var error = '';
		if(verifiedTransaction.signature!='verified') {
			error = 'Forged transaction';
		}
		var verifiedObject = JSON.parse(verifiedTransaction.plaintext);
		var sender = (verifiedObject["sender"] && verifiedObject["sender"]==0) ? 0:cryptico.publicKeyID(verifiedTransaction.publicKeyString);
		var recipient = verifiedObject["recipient"];
		var amount = verifiedObject["amount"];
		var timestamp = verifiedObject["timestamp"];
		
		if (!sender || !recipient || !amount) {
			verify = false;
		}
		if(amount < 0) {
			error = 'Negative transfer';
		}
		if(sender!=0 && sender!=cryptico.publicKeyID(verifiedTransaction.publicKeyString)) {
			callback('fail_sender_not_signer');
		}
		if(senders.indexOf(sender) > -1) {
			error = 'Double spent for one block';
		}
		senders.push(sender);
		var balance = client.getBalance(function(balance) {
			if(balance<amount) {
				error = 'Not enough funds';
			}
			verifiedObject.verified = (error=='');
			verifiedObject.transaction = item;
			verifiedObject.error = error;
			addTransaction(verifiedObject);
		});

	});
}

function proofDecoder(proof, callback) {	

	Quagga.decodeSingle({
		decoder: {
			readers: ["ean_reader"] // List of active readers
		},
		locate: true, // try to locate the barcode in the image
		src: proof
		}, function(result){
			if(result.codeResult) {
				callback(result.codeResult.code);
				console.log(client.last_proof);
			} else {
				alert('Cannot read proof!');
			}
	});
}

$(function() {
    var value;
	var backCamID;

	Quagga.CameraAccess.enumerateVideoDevices()
	.then(function(devices) {
	  devices.forEach(function(device) {
		if( device.kind == "videoinput" && device.label.match(/back/) != null ){
		  //alert("Back found!");
		  backCamID = device.deviceId;
		} 
	  });
	})
	.catch(function(err) {
	  //alert(err.name + ": " + err.message);
	});

	if(typeof(backCamID)=="undefined"){
	  console.log("back camera not found.");
	}
    App = {
        init : function() {
            Quagga.init(this.state, function(err) {
                if (err) {
                    console.log(err);
                    return;
                }			
                App.attachListeners();
                Quagga.start();
            });
        },
		 decode: function(src) {	
		Quagga.decodeSingle({
              decoder: {
                readers: [{
                    format: "ean_reader",
                    config: {}
                }]
            },
			  locate: true, // try to locate the barcode in the image
			  src: src, 
			  locator: {
                patchSize: "x-large",
                halfSample: false
				},
				inputStream: {
                size: 800
				}	
			}, function(result){
			  console.log(result);
			});
		},
        initCameraSelection: function(){
            var streamLabel = Quagga.CameraAccess.getActiveStreamLabel();

            return Quagga.CameraAccess.enumerateVideoDevices()
            .then(function(devices) {
                function pruneText(text) {
                    return text.length > 30 ? text.substr(0, 30) : text;
                }
                var $deviceSelection = document.getElementById("deviceSelection");
                while ($deviceSelection.firstChild) {
                    $deviceSelection.removeChild($deviceSelection.firstChild);
                }
                devices.forEach(function(device) {
                    var $option = document.createElement("option");
                    $option.value = device.deviceId || device.id;
                    $option.appendChild(document.createTextNode(pruneText(device.label || device.deviceId || device.id)));
                    $option.selected = streamLabel === device.label;
                    $deviceSelection.appendChild($option);
                });
            });
        },
        querySelectedReaders: function() {
        return Array.prototype.slice.call(document.querySelectorAll('.readers input[type=checkbox]'))
            .filter(function(element) {
                return !!element.checked;
            })
            .map(function(element) {
                return element.getAttribute("name");
            });
    },
        attachListeners: function() {
            var self = this;

            self.initCameraSelection();
            
            $(".controls .reader-config-group").on("change", "input, select", function(e) {
                e.preventDefault();
                var $target = $(e.target);
                   // value = $target.attr("type") === "checkbox" ? $target.prop("checked") : $target.val(),
                   value =  $target.attr("type") === "checkbox" ? this.querySelectedReaders() : $target.val();
                  var  name = $target.attr("name"),
                    state = self._convertNameToState(name);

                console.log("Value of "+ state + " changed to " + value);
                self.setState(state, value);
            });
        },
        _accessByPath: function(obj, path, val) {
            var parts = path.split('.'),
                depth = parts.length,
                setter = (typeof val !== "undefined") ? true : false;

            return parts.reduce(function(o, key, i) {
                if (setter && (i + 1) === depth) {
                    if (typeof o[key] === "object" && typeof val === "object") {
                        Object.assign(o[key], val);
                    } else {
                        o[key] = val;
                    }
                }
                return key in o ? o[key] : {};
            }, obj);
        },
        _convertNameToState: function(name) {
            return name.replace("_", ".").split("-").reduce(function(result, value) {
                return result + value.charAt(0).toUpperCase() + value.substring(1);
            });
        },
        detachListeners: function() {
            $(".controls").off("click", "button.stop");
            $(".controls .reader-config-group").off("change", "input, select");
        },
        setState: function(path, value) {
            var self = this;

            if (typeof self._accessByPath(self.inputMapper, path) === "function") {
                value = self._accessByPath(self.inputMapper, path)(value);
            }

            self._accessByPath(self.state, path, value);

            console.log(JSON.stringify(self.state));
            App.detachListeners();
            Quagga.stop();
            App.init();
        },
        inputMapper: {
            inputStream: {
                constraints: function(value){
                    if (/^(\d+)x(\d+)$/.test(value)) {
                        var values = value.split('x');
                        return {
                            width: {min: parseInt(values[0])},
                            height: {min: parseInt(values[1])}
                        };
                    }
                    return {
                        deviceId: value
                    };
                }
            },
            numOfWorkers: function(value) {
                return parseInt(value);
            },
            decoder: {
                readers: function(value) {
                    if (value === 'ean_extended') {
                        return [{
                            format: "ean_reader",
                            config: {
                                supplements: [
                                    'ean_5_reader', 'ean_2_reader'
                                ]
                            }
                        }];
                    }
                    console.log("value before format :"+value);
                    return [{
                        format: value + "_reader",
                        config: {}
                    }];
                }
            }
        },
        state: {
            inputStream: {
                type : "LiveStream",
                constraints: {
                    width: {min: 300},
                    height: {min: 300},
                    aspectRatio: {min: 1, max: 100},
                    // facingMode: "environment" // or user
				    deviceId: backCamID
                }
            },
            locator: {
                patchSize: "large",
                halfSample: true
            },
            numOfWorkers: 4,
            decoder: {
                readers : ["ean_reader"]
            },
            locate: true,
            multiple:true
        },
        lastResult : null
    };

    Quagga.onProcessed(function(result) {
        var drawingCtx = Quagga.canvas.ctx.overlay,
            drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                result.boxes.filter(function (box) {
                    return box !== result.box;
                }).forEach(function (box) {
                    Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
                });
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
            }

            if (result.codeResult && result.codeResult.code) {
                Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
            }
        }
    });

    Quagga.onDetected(function(result) {
		if(!client.last_proof) {
			return;
		}
		
        code = result.codeResult.code;	
        if (App.lastResult !== code && showResult) {
            App.lastResult = code;
            var $node = null, canvas = Quagga.canvas.dom.image;
			data = canvas.toDataURL();
            $node = $('<li><div class="thumbnail"><div class="imgWrapper"><img /></div><div class="caption"><h4 class="code"></h4></div></div></li>');
            $node.find("img").attr("src", data);
            $node.find("h4.code").html(code);
            $("#result_strip ul.thumbnails").prepend($node);	
			Quagga.stop();
			$( ".viewport" ).css("visibility", "hidden");
			$( ".viewport" ).css("height", "0px");					
			if(client.isValidToken(code)) {			
			    barcode_image = data;
				var $node = $('<li><button id="action-btn" class="btn-group" onclick="send();">Upload</button></li>');
				$("#result_strip ul.thumbnails").prepend($node);				
			} else {
				barcode_image = null;
				var $node = $('<li><div class="thumbnail"><p id="result-text" style="word-break: break-all;text-align:center;">No hash</p></div></li>');
				$("#result_strip ul.thumbnails").prepend($node);
			}
			code=null;
			App.lastResult=null;
        }
    });
});

function getSelectedTransactions() {
	var ret = [];
	var i, selRowIds = jQuery("#list4").jqGrid("getGridParam", "selarrrow"), n, rowData;
	for (i = 0, n = selRowIds.length; i < n; i++) {
	    rowData = jQuery("#list4").jqGrid("getLocalRow", selRowIds[i]);
	    ret.push(rowData.data);
	}	
	return ret;
}
	
function send() {
	var publicKeyID = localStorage.getItem("publicKeyID");	
	var message = "message="+encodeURIComponent(JSON.stringify({"wallet_id":publicKeyID, "barcode_image":barcode_image, "transactions": getSelectedTransactions()}));
	upload('mine', message, function(jsonResponse) {
			var message = jsonResponse['message'];	
			$("#result_strip ul.thumbnails").empty();			
			var $node = $('<li><div class="thumbnail"><p id="result-text" style="word-break: break-all;text-align:center;">'+message+'</p></div></li>');
			$("#result_strip ul.thumbnails").prepend($node);
			last_proof = null;
			barcode_image = null;
			code = null;
			showResult = false;
			loadData();
	});
}

function readBarcode(){
	$("#result_strip ul.thumbnails").empty();
	$( ".viewport" ).css("visibility", "visible");
	$( ".viewport" ).css("height", "300px");
	showResult = true;
	App.init();
}

function onFileSelected(event) {
	  $("#result_strip ul.thumbnails").empty();
	  var selectedFile = event.target.files[0];
	  showResult = true;
	  App.decode(URL.createObjectURL(selectedFile));
}
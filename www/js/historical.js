var columnId = 0;
var blockchain_length = 0;
function init() {
	loadKey();
	loadNodeName();
	jQuery("#list4").jqGrid({datatype: "local", pager: '#pager2', shrinktofit:false, autowidth: true, height: 250, colNames:['Id','Transaction'],
	colModel:[ {name:'id',index:'id', width:60, sorttype:"int", align:"left"}, {name:'transaction',index:'transaction', align:"left"}],
	caption: "Transaction #", viewrecords: true, onPaging: function(pgButton) {
		     var page = $(this).jqGrid("getGridParam", "page");
		     console.log(pgButton);
		     if(pgButton=="next_pager2"){ 
			page++;
		    } 
		    if(pgButton=="prev_pager2"){ 
			page--;
		    } 
		    if(pgButton=="last_pager2"){ 
			page = blockchain_length;            
		    }
		    if(pgButton=="first_pager2"){ 
			page = 0;
		    }
		     console.log('Next page:'+page);
		     loadData(page);
		}
        });
	client.getBlockLength(setLength);	
}
function setLength(length) {
	blockchain_length = length;
	jQuery("#list4").jqGrid('setGridParam', {recordtext: "View "+length+" - of "+length, caption: "Transaction #"+length}).trigger("reloadGrid");
	loadData(length);
}

function loadData(index) {	
	jQuery("#list4").jqGrid("clearGridData");
	console.log('set:'+index);
	client.loadBlockChainTransactions(index, onDataLoaded);
}
function onDataLoaded(index, data) {
console.log('page:'+index);
console.log('lastpage:'+blockchain_length);
jQuery("#list4").jqGrid('setCaption', "Transaction #"+index);
	jQuery("#list4").jqGrid('setGridParam', {
            page: index,
            lastpage: blockchain_length
        });	
	
	columnId = 0;	
	var image = document.getElementById('proof');
	console.log('Set image');
	image.src = data.proof;
	
	var node = document.getElementById('node');
	node.innerHTML = data.node;
	
	var previous = document.getElementById('previous-hash');
	previous.innerHTML = data.previous_hash;
	
	var hashElement = document.getElementById('hash');
	hashElement.innerHTML = hash(data);
	
	data.transactions.forEach(addTransaction);
}

function hash(block) {
    var block_string = JSON.stringify(block);
    return sha256(block_string);
}

function addTransaction(signedTransaction) {
	var transaction = JSON.parse(cryptico.verify(signedTransaction).plaintext);
	
	var row = 
		 {"id":columnId++, "transaction":"Sender: " + transaction.sender + "\n"
		 + "Recipient: " + transaction.recipient + "\n"
		 + "Amount: " + transaction.amount + "\n"
		 + "Timestamp: " + new Date(transaction.timestamp).toGMTString(), "data":transaction.transaction};	
	jQuery("#list4").jqGrid('addRowData',columnId, row);
}
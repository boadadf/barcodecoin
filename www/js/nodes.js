var columnId = 0;
function init() {
	loadKey();
	loadNodeName();
	loadNodeName("node-name-span");
	jQuery("#list4").jqGrid({datatype: "local", shrinktofit:false, autowidth: true, height: 250, colNames:['Id','Name', 'URL'],
	colModel:[ {name:'id',index:'id', width:60, sorttype:"int", align:"left"}, {name:'name',index:'name', align:"left"}, {name:'url',index:'url', align:"left"}],
	caption: "Nodes", viewrecords: true
        });
	client.getNodes(onDataLoaded);	
}

function onDataLoaded(data) {	
	data.forEach(function(rowData) {
	
	var row = 
		{"id":columnId++, "name":rowData.name, "url":rowData.url};	
		jQuery("#list4").jqGrid('addRowData',columnId, row);	
	});
}
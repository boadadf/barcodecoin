			function printNote(value, jsonPrivateKey) {

				var tempImageThumb = $('#tempImageThumbnail');
				tempImageThumb.append('<div class="bgimg visualization" style="height:545px;width:1245px"><div id="qrcode" style="height: 300px; width:300px; margin-left:825px;padding-top:165px"></div></div>');

				var typeNumber = 0;
				var errorCorrectionLevel = 'L';
				var qr = qrcode(typeNumber, errorCorrectionLevel);
				qr.addData(jsonPrivateKey);
				qr.make();
				document.getElementById("qrcode").innerHTML = qr.createImgTag(3);
				
				html2canvas([tempImageThumb.get(0)], {
					onrendered: function (canvas) {
					if (navigator.msSaveBlob) {
					  console.log('this is IE');
					  var URL=window.URL;
					  var BlobBuilder = window.MSBlobBuilder;
					  navigator.saveBlob=navigator.msSaveBlob;
					  var imgBlob = canvas.msToBlob();
					  if (BlobBuilder && navigator.saveBlob) {
						var showSave =  function (data, name, mimetype) {
						  var builder = new BlobBuilder();
						  builder.append(data);
						  var blob = builder.getBlob(mimetype||"application/octet-stream");
						  if (!name)
							name = "Download.bin";
						  navigator.saveBlob(blob, name);
						};
						showSave(imgBlob, value+'_barcodes.png',"image/png");
					  }
					} else {
					  if ($('#export-image-container').length == 0)						 
						  $('body').append('<a id="export-image-container" download="'+value+'_barcodes.jpg">')
					  img = canvas.toDataURL("image/jpeg")
					  img = img.replace('data:image/jpeg;base64,', '')
					  finalImageSrc = 'data:image/jpeg;base64,' + img

					  $('#export-image-container').attr('href', finalImageSrc);
					  $('#export-image-container')[0].click();
					  $('#export-image-container').remove();	
					   				  
					}
				  }});
			}
			
			function create() {
				var amount = document.getElementById("amount-field").value;
				var p = document.getElementById("key-field");
				client.transferToNewWallet(amount, (jsonPrivateKey)=>{					
						printNote(amount, jsonPrivateKey);
						p.innerHTML = 'Your account will be debited with '+value+' Barcodes';						
				},(error)=>{p.innerHTML = 'Error, cannot cash:'+error;});
			}
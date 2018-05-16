var video;
    var resultDiv;
    var canvas;
    var context;
    var checkbox;
	var width;
    var height;
	
	function readQR() { 
	var panel = document.getElementById("video-panel");
	panel.innerHTML = '<div style="height:300px"><video id="video" autoplay="true" style="display:none; width:300px; height:300px"></video><canvas id="canvas" style="width:300px; height:300px;"></canvas></div><div id="result"></div><div><p id="status-field" style="text-align:center;font-size:40px"></p></div>';
  
    video = document.getElementById("video");
    resultDiv = document.getElementById("result");
    canvas = document.getElementById("canvas");
    context = canvas.getContext("2d");
    checkbox = document.getElementById("checkbox");
	width = parseInt(canvas.style.width);
    height = parseInt(canvas.style.height);
	
  
    canvas.width = width;
    canvas.height = height;
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (navigator.getUserMedia){
      function successCallback(stream){
        
      }
      function errorCallback(){}
      //navigator.getUserMedia({video: {facingMode: {exact: 'environment'}}});
	  const constraints = {
        advanced: [{
            facingMode: "environment", width: 300, height: 300
        }]
    };
     navigator.mediaDevices
        .getUserMedia({
            video: constraints
        })
        .then((stream) => {
            if (window.webkitURL) {
			  video.src = window.webkitURL.createObjectURL(stream);
			} else if (video.mozSrcObject !== undefined) {
			  video.mozSrcObject = stream;
			} else {
			  video.src = stream;
			}
        });
	  
      requestAnimationFrame(tick);
    }
	}
	var finished=false;
    function tick(){	
	if(finished) {
		return;
	}	
	  requestAnimationFrame(tick);
      if (video.readyState === video.HAVE_ENOUGH_DATA){
        // Load the video onto the canvas
        context.drawImage(video, 0, 0, width, height);
        // Load the image data from the canvas
        var imageData = context.getImageData(0, 0, width, height);
          var decoded = jsQR.decodeQRFromImage(imageData.data, imageData.width, imageData.height);
          if(decoded) {
		    finished = true;
            resultDiv.innerHTML = "<div style='color: green; margin:15px;'>QR Decoded!</div>";			
			video.pause();
			var keyJson = JSON.parse(decoded);			
			transfer(RSAKey.fromJSON(keyJson['privateKey'], RSAKey.fromJSON(keyJson['publicKey']));			
          } else if (!video.paused){
            resultDiv.innerHTML = "<div style='color: red; margin:15px;'>No QR Decoded</div>";
          }        
      }
    }
	
	function transfer(senderPrivateKey, senderPublicKey) {
		client.transferAll(senderPrivateKey, senderPublicKey, function(message) {
			resultDiv.innerHTML = "<div style='color: green; margin:15px;'>QR Decoded! <span style='color: #000;'>"+message+"</span></div>";
		});
	}
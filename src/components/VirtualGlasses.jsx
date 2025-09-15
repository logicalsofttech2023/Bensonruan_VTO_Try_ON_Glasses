import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import './VirtualGlasses.css';

const VirtualGlasses = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [isVideo, setIsVideo] = useState(false);
  const [model, setModel] = useState(null);
  const [selectedGlasses, setSelectedGlasses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stream, setStream] = useState(null);
  
  // Scene references
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const glassesArrayRef = useRef([]);
  const animationFrameRef = useRef(null);
  
  const glassesList = [
    {
      image: "/3dmodel/glasses-01/glasses_01.png",
      type: "gltf",
      modelPath: "/3dmodel/glasses-01/",
      model: "scene.gltf",
      x: 0,
      y: 0.5,
      z: 0,
      up: 10,
      scale: 0.01
    },
    // ... rest of the glasses list
  ];

  const glassesKeyPoints = {
    midEye: 168,
    leftEye: 143,
    noseBottom: 2,
    rightEye: 372
  };

  useEffect(() => {
    setup3dScene();
    setup3dCamera();
    setup3dGlasses();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isVideo) {
      setup3dGlasses();
      setup3dAnimate();
    }
  }, [selectedGlasses, isVideo]);

  const setup3dScene = () => {
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true
    });

    // Light
    const frontLight = new THREE.SpotLight(0xffffff, 0.3);
    frontLight.position.set(10, 10, 10);
    scene.add(frontLight);
    
    const backLight = new THREE.SpotLight(0xffffff, 0.3);
    backLight.position.set(10, 10, -10);
    scene.add(backLight);

    sceneRef.current = scene;
    rendererRef.current = renderer;
  };

  const setup3dCamera = () => {
    if (isVideo && videoRef.current) {
      const video = videoRef.current;
      const videoWidth = video.videoWidth || 640;
      const videoHeight = video.videoHeight || 480;
      
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
      camera.position.x = videoWidth / 2;
      camera.position.y = -videoHeight / 2;
      camera.position.z = -(videoHeight / 2) / Math.tan(45 / 2);
      camera.lookAt({ x: videoWidth / 2, y: -videoHeight / 2, z: 0, isVector3: true });
      
      rendererRef.current.setSize(videoWidth, videoHeight);
      rendererRef.current.setClearColor(0x000000, 0);
      
      cameraRef.current = camera;
    } else {
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 0, 1.5);
      camera.lookAt(sceneRef.current.position);
      
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      rendererRef.current.setClearColor(0x3399cc, 1);
      
      const controls = new OrbitControls(camera, rendererRef.current.domElement);
      controlsRef.current = controls;
      cameraRef.current = camera;
    }

    // Add camera to scene if not already added
    let cameraExists = false;
    sceneRef.current.children.forEach(child => {
      if (child.type === 'PerspectiveCamera') {
        cameraExists = true;
      }
    });
    
    if (!cameraExists) {
      cameraRef.current.add(new THREE.PointLight(0xffffff, 0.8));
      sceneRef.current.add(cameraRef.current);
    }
  };

  const setup3dGlasses = async () => {
    return new Promise(resolve => {
      // Clear existing glasses
      for (let i = sceneRef.current.children.length - 1; i >= 0; i--) {
        const obj = sceneRef.current.children[i];
        if (obj.type === 'Group') {
          sceneRef.current.remove(obj);
        }
      }
      glassesArrayRef.current = [];

      const selected = glassesList[selectedGlasses];
      
      if (selected.type === 'gltf') {
        const gltfLoader = new GLTFLoader();
        gltfLoader.setPath(selected.modelPath);
        gltfLoader.load(selected.model, object => {
          object.scene.position.set(selected.x, selected.y, selected.z);
          let scale = selected.scale;
          if (window.innerWidth < 480) {
            scale = scale * 0.5;
          }
          object.scene.scale.set(scale, scale, scale);
          sceneRef.current.add(object.scene);
          glassesArrayRef.current.push(object.scene);
          resolve('loaded');
        });
      }
    });
  };

  const setup3dAnimate = () => {
    if (!isVideo) {
      animationFrameRef.current = requestAnimationFrame(setup3dAnimate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  const startCamera = async () => {
    try {
      setLoading(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: 640,
          height: 480
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await new Promise(resolve => {
          videoRef.current.onloadedmetadata = () => {
            resolve();
          };
        });
      }
      
      await startVTGlasses();
      setIsVideo(true);
      setError('');
    } catch (err) {
      setError('कैमरा एक्सेस करने में असमर्थ। कृपया कैमरा अनुमति दें।');
      console.error('Camera error:', err);
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsVideo(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleWebcamSwitch = async () => {
    if (!isVideo) {
      await startCamera();
    } else {
      stopCamera();
    }
  };

  const startVTGlasses = async () => {
    const loadedModel = await faceLandmarksDetection.load(
      faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
    );
    setModel(loadedModel);
    detectFaces();
  };

  const detectFaces = async () => {
    if (!model || !videoRef.current || !isVideo) return;

    try {
      const faces = await model.estimateFaces({
        input: videoRef.current,
        returnTensors: false,
        flipHorizontal: false,
        predictIrises: false
      });

      await drawGlasses(faces);
      
      if (isVideo) {
        animationFrameRef.current = requestAnimationFrame(detectFaces);
      }
    } catch (err) {
      console.error('Face detection error:', err);
    }
  };

  const drawGlasses = async (faces) => {
    if (isVideo && glassesArrayRef.current.length !== faces.length) {
      // Clear and setup new glasses if face count changes
      for (let j = 0; j < faces.length; j++) {
        await setup3dGlasses();
      }
    }

    for (let i = 0; i < faces.length; i++) {
      const glasses = glassesArrayRef.current[i];
      const face = faces[i];
      
      if (glasses && face) {
        const pointMidEye = face.scaledMesh[glassesKeyPoints.midEye];
        const pointLeftEye = face.scaledMesh[glassesKeyPoints.leftEye];
        const pointNoseBottom = face.scaledMesh[glassesKeyPoints.noseBottom];
        const pointRightEye = face.scaledMesh[glassesKeyPoints.rightEye];

        const selected = glassesList[selectedGlasses];

        glasses.position.x = pointMidEye[0];
        glasses.position.y = -pointMidEye[1] + selected.up;
        glasses.position.z = -cameraRef.current.position.z + pointMidEye[2];

        glasses.up.x = pointMidEye[0] - pointNoseBottom[0];
        glasses.up.y = -(pointMidEye[1] - pointNoseBottom[1]);
        glasses.up.z = pointMidEye[2] - pointNoseBottom[2];
        
        const length = Math.sqrt(
          glasses.up.x ** 2 + glasses.up.y ** 2 + glasses.up.z ** 2
        );
        glasses.up.x /= length;
        glasses.up.y /= length;
        glasses.up.z /= length;

        const eyeDist = Math.sqrt(
          (pointLeftEye[0] - pointRightEye[0]) ** 2 +
          (pointLeftEye[1] - pointRightEye[1]) ** 2 +
          (pointLeftEye[2] - pointRightEye[2]) ** 2
        );
        
        glasses.scale.x = eyeDist * selected.scale;
        glasses.scale.y = eyeDist * selected.scale;
        glasses.scale.z = eyeDist * selected.scale;

        glasses.rotation.y = Math.PI;
        glasses.rotation.z = Math.PI / 2 - Math.acos(glasses.up.x);

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
  };

  const selectGlasses = (index) => {
    setSelectedGlasses(index);
  };

  const navigateGlasses = (direction) => {
    if (direction === 'left') {
      setSelectedGlasses(prev => (prev > 0 ? prev - 1 : glassesList.length - 1));
    } else {
      setSelectedGlasses(prev => (prev < glassesList.length - 1 ? prev + 1 : 0));
    }
  };

  return (
    <div id="virtual-glasses-app">
      <div className="form-control webcam-start" id="webcam-control">
        <label className="form-switch">
          <input 
            type="checkbox" 
            id="webcam-switch" 
            checked={isVideo}
            onChange={handleWebcamSwitch}
          />
          <i></i>
          <span id="webcam-caption">
            {isVideo ? "बंद करें" : "आज़माएं"}
          </span>
        </label>
      </div>

      <div id="image-container">
        <canvas 
          ref={canvasRef} 
          id="canvas" 
          width="640" 
          height="480" 
        />
        
        {loading && (
          <div className="loading">
            मॉडल लोड हो रहा है
            <div className="spinner-border" role="status">
              <span className="sr-only"></span>
            </div>
          </div>
        )}

        {/* Glasses Slider */}
        <div id="glasses-slider">
          <img 
            id="arrowLeft" 
            src="/images/arrow-left.png" 
            alt="Previous glasses"
            onClick={() => navigateGlasses('left')}
          />
          <div id="glasses-list">
            <ul>
              {glassesList.map((glasses, index) => (
                <li 
                  key={index}
                  className={selectedGlasses === index ? "selected-glasses" : ""}
                  onClick={() => selectGlasses(index)}
                >
                  <img
                    src={glasses.image}
                    alt={`Glasses style ${index + 1}`}
                  />
                </li>
              ))}
            </ul>
          </div>
          <img 
            id="arrowRight" 
            src="/images/arrow-right.png" 
            alt="Next glasses"
            onClick={() => navigateGlasses('right')}
          />
        </div>
      </div>

      {error && (
        <div id="errorMsg" className="col-12 col-md-6 alert-danger">
          {error}
          <br/>
          यदि आप सोशल मीडिया ब्राउज़र का उपयोग कर रहे हैं, तो कृपया Safari (iPhone)/Chrome (Android) में पेज खोलें
          <button 
            id="closeError" 
            className="btn btn-primary ml-3"
            onClick={() => setError('')}
          >
            OK
          </button>
        </div>
      )}

      {/* Hidden video element for webcam */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default VirtualGlasses;
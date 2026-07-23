

//import 'jspsych/css/jspsych.css'
import './style.css'

/*
import { initJsPsych } from "jspsych"
import instructions from "@jspsych/plugin-instructions"
import canvasKeyboardResponse from "@jspsych/plugin-canvas-keyboard-response"
import canvasButtonResponse from "@jspsych/plugin-canvas-button-response"
import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response"
import htmlButtonResponse from "@jspsych/plugin-html-button-response"
*/



import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import _, { forEach } from "lodash";

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js'
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';


let globalSettings
let xAxis = new THREE.Vector3(1, 0, 0)
let yAxis = new THREE.Vector3(0, 1, 0)
let zAxis = new THREE.Vector3(0, 1, 0)
let worldPointer = new THREE.Vector3(0, 0, 0.5);
let distance_vector = new THREE.Vector3(0, 0, 0)
let worldPos = new THREE.Vector3();

let warningBox;
let warningBoxText;
let warningMessageText;

let materialTypes = ['blur', 'opaque', 'transparent']


let mouseSmoothing = 8.0;
const targetRotation = {
    x: 0, // pitch
    y: 0  // yaw
};

// Clamp values (in radians)
const MIN_X = THREE.MathUtils.degToRad(-40);
const MAX_X = THREE.MathUtils.degToRad(60);

function degToRad(degrees) {
    return (degrees * (Math.PI / 180))
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// We use this to get accurate timestamps since threejs timer is tied to requestanimationframe which pauses when the tab is not in focus
class ExperimentClock {
    constructor() {
        this.startTime = 0;
        this.lastTime = 0;
        this.endTime = 0;
        this.currentTime = 0;
        this.delta = 0;

        this._preloadFinishedCallback = null;
        this.preloadedGLBsDone = false

        this._pointerMoveCallback = null;
        this._pointerDownCallback = null;
        this._pointerUpCallback = null;

        this._updateCallback = null;

    }

    start() {
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        this.currentTime = this.startTime;
    }

    getDelta() {
        this.currentTime = performance.now();
        this.delta = this.currentTime - this.lastTime;
        this.lastTime = this.currentTime;
        return this.delta;
    }

    getCurrentTime() {
        return performance.now();
    }

    getElapsedTime() {
        return performance.now() - this.startTime;
    }

    tick() {
        this.currentTime = performance.now();
        this.lastTime = this.currentTime;
    }

    stop() {
        this.endTime = performance.now();
        this.currentTime = this.endTime;
    }

    reset() {
        const now = performance.now();
        this.startTime = now;
        this.endTime = 0;
        this.currentTime = now;
        this.lastTime = now;
        this.delta = 0;
    }
}

const MaskShader = {
    uniforms: {
        "tDiffuse": { value: null },  // the blurred scene (current pass input)
        "tSharp": { value: null },    // the original sharp scene
        "mouse": { value: new THREE.Vector2(0.5, 0.5) },
        "aspect": { value: window.innerWidth / window.innerHeight },
        "radius": { value: 0.15 },
        "softness": { value: 0.1 },
        "maskType": { value: 0 },     // 0 = blur, 1 = solid/transparent color
        "maskColor": { value: new THREE.Color(0x000000) },
        "maskAlpha": { value: 0.7 },  // 1.0 = fully opaque, < 1.0 = transparent tint
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tSharp;
        uniform vec2 mouse;
        uniform float aspect;
        uniform float radius;
        uniform float softness;
        uniform int maskType;
        uniform vec3 maskColor;
        uniform float maskAlpha;
        varying vec2 vUv;

        void main() {
            vec4 blurred = texture2D(tDiffuse, vUv);
            vec4 sharp = texture2D(tSharp, vUv);

            // Aspect corrected distance from mouse
            vec2 uv = vUv;
            vec2 m = mouse;
            uv.x *= aspect;
            m.x *= aspect;
            float dist = distance(uv, m);

            // 1.0 inside circle, 0.0 outside
            float inside = smoothstep(radius, radius - softness, dist);

            vec3 outside;

            if (maskType == 0) {
                // Blur: outside is blurred scene
                outside = blurred.rgb;
            } else {
                // Color: outside is a mix of the sharp scene and the mask color.
                // If maskAlpha is 1.0, this becomes 100% maskColor (Opaque).
                // If maskAlpha is 0.5, this becomes a 50% tinted overlay (Transparent).
                outside = mix(sharp.rgb, maskColor, maskAlpha);
            }

            // Inside the circle always shows the sharp scene
            gl_FragColor = vec4(mix(outside, sharp.rgb, inside), sharp.a);
        }
    `
};

class InteractiveSearchToolbox {
    constructor(userSettings = null) {

        // Default settings
        globalSettings = {
            enableAmbientLighting: false,
            responsiveDisplaySize: true,
            enableHDRI: false,
            threeJSVersion: "",
            jsPsychVersion: "",
            jsPychPlugins: [],
            defaultJsPychPlugins: ["plugin-instructions", "plugin-canvas-keyboard-response", "plugin-canvas-button-response", "plugin-html-keyboard-response", "plugin-html-button-response"],
        };




        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(globalSettings, userSettings)
        }

        this.preloadingManager = new THREE.LoadingManager();

        this.preloadingManager.onLoad = () => {

            this.preloadedGLBsDone = true;

            if (this._preloadFinishedCallback != null) {
                this._preloadFinishedCallback();
            }
        }

        this.preloadingManager.onError = (url) => {
            console.error('Error loading:', url);
        };


        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onLoad = () => {
            this.onLoadingManagerLoad()
        }

        this.loadingManager.onError = (url) => {
            console.error('Error loading:', url);
        };

        this.loadedModels = [];
        this.loadedTextures = [];
        this.loadedEnvs = [];
        this.loadingScreen;
        this.backgroundColor = '#c7c7c7';


        this.scene;
        this.camera;
        this.ambientLight
        this.renderer;
        this.enableLighting = true
        this.interactiveCanvas;
        this.stimuliInScene = []
        this.selectedObject = null
        this.helperControls = true

        this.mainComposer
        this.blurRT
        this.blurComposer
        this.finalPass
        this.hBlur
        this.vBlur

        this.firstPersonMouseSensitivity = 0.2;
        this.dragToRotateSensitivity = 200
        this.sensitivityFlags = []

        this.blurSettings = {
            intensity: 1.5 // 1.0 is standard, 0.0 is no blur, 5.0+ is very heavy
        };


        // Interaction Controls variables
        this.raycaster = new THREE.Raycaster();
        this.raycaster.layers.set(0);
        this.pointer = new THREE.Vector2();
        this.pointerDelta = new THREE.Vector2();
        this.mouseX = 0;
        this.mouseY = 0;
        this.previousPointer = new THREE.Vector2();
        this.delta = 0
        this.currentFrameTime = 0
        this.timer = new THREE.Timer();
        this.timer.connect(document);

        this.experimentClock = new ExperimentClock()

        this.worldPosition = new THREE.Vector3()
        //this.zOffset = 5
        //this.zTarget = new THREE.Vector3()
        this.pointerDown = false;
        this.pointerUp = true;
        this.currentRaycastObject = null;
        this.checkStats = false
        //this.debugCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),new THREE.MeshBasicMaterial({ color: 0x00ff00 }));


        //this.orbitControls;
        this.dragToRotateEnabled = false
        this.orbitControlsEnabled = false
        this.dragControlsEnabled = false
        this.maskControlsEnabled = false
        this.FPControlsEnabled = false
        this.currentMaskType = null
        this.currentControls = null
        this.isOrbiting = false
        this.isPivoting = false


        this.maskControls;
        this.maskPlane;
        this.animationRequestID = null;

        this.objectsInScene = []

        this.shouldCollectData = false
        this.realTimeTracking = false
        this.currentTrialIndex = 0;
        this.currentSceneInfo = [];
        this.interactionData = {
            IST_TRIAL_INDEX: [],
            SCENE_INFO: [],
            INTERACTION_DATA: [],
        }
        this.singleTrialInteractionData = {
            TIMESTAMP: [],
            INTERACTION_TIME: [],
            CURRENT_OBJECT: [],
            X_POS: [],
            Y_POS: [],
            Z_POS: [],
            X_ROT: [],
            Y_ROT: [],
            Z_ROT: [],
            W_ROT: [],
            MOUSE_X_POS: [],
            MOUSE_Y_POS: []
        }


        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);
        this.stats.dom.style.display = 'none'

        document.body.style.margin = "0";

        this.setupLoadingScreen();
        //this.turnOnLoadingScreen();

        this.setupWarningMessage();
        //this.setupToolbox();
    }

    async loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async loadCSSLink(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.href = url;
            link.rel = "stylesheet";
            link.type = "text/css";
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(link);
        });
    }

    async loadScriptsSequentially(urls) {
        for (const url of urls) {
            if (url.includes(".css")) {
                await this.loadCSSLink(url)
            } else {
                await this.loadScript(url);
            }

        }
    }


    async init() {
        const jsPsychVersion = globalSettings.jsPsychVersion
        const jsPsychPlugins = globalSettings.jsPychPlugins
        const defaultJsPychPlugins = globalSettings.defaultJsPychPlugins
        const jsPsychPluginsToLoad = []
        const librariesToLoad = []
        const cssToLoad = []

        if (jsPsychVersion != "") {
            librariesToLoad.push("https://unpkg.com/jspsych@" + jsPsychVersion)
            librariesToLoad.push("https://unpkg.com/jspsych@" + jsPsychVersion + "/css/jspsych.css")
        } else {
            librariesToLoad.push("https://unpkg.com/jspsych") // Default is latest
            librariesToLoad.push("https://unpkg.com/jspsych@latest/css/jspsych.css")
        }

        // Check if user is trying to add libraries that are already loaded...
        for (const url of defaultJsPychPlugins) {
            jsPsychPluginsToLoad.push(url)
        }

        for (const url of jsPsychPlugins) {
            const pluginName = url.split('@')[0]
            let isInDefaults = false

            // For each object inside jsPsychPluginsToLoad
            for (let i = 0; i < jsPsychPluginsToLoad.length; i++) {
                const defaultURL = jsPsychPluginsToLoad[i]
                if (defaultURL.includes(pluginName)) {
                    console.log('Plugin already found in defaults')
                    isInDefaults = true
                    // Check if they added a version number else
                    if (url.includes("@")) {
                        console.log('User included version number, we use this instead')

                        // Remove previous and use this instead
                        jsPsychPluginsToLoad[i] = url
                    } else {
                        console.log('User did not include version number, sticking with default')
                    }

                }
            }

            if (!isInDefaults) {
                jsPsychPluginsToLoad.push(url)
            }
        }

        // Now actually handle all of the jspsych libraries
        for (const url of jsPsychPluginsToLoad) {
            librariesToLoad.push("https://unpkg.com/@jspsych/" + url)
        }
        console.log(librariesToLoad)

        try {
            await this.loadScriptsSequentially(librariesToLoad);
            this.setupToolbox();
        } catch (error) {
            console.error('Failed to load required scripts:', error);
            alert('Oops, something has gone wrong! Please try to reload the page.');
            throw error; // stops the module here instead of returning
        }




    }



    onPreloadFinished(callback) {
        // Users manually update this in their own code.
        this._preloadFinishedCallback = callback;
    }



    onLoadingManagerLoad() {
        // Users do not touch this one.
        //this.turnOffLoadingScreen()
        console.log('All files loaded')
    }

    enableDataCollection(userSettings = null) {
        const settings = {
            realTimeTracking: true
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)

        this.shouldCollectData = true
    }

    disableDataCollection() {
        this.shouldCollectData = false
    }

    async saveData(useFilePicker = false) {
        const date = new Date();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const filename = 'interactionData_' + day + '_' + month + '_' + year + '.json';

        const json = this.getData(true);

        if (useFilePicker && window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await fileHandle.createWritable();
                await writable.write(json);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('showSaveFilePicker failed, falling back:', err);
            }
        }

        // Default behaviour
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getData(stringify = false) {
        if (stringify) {
            const dataToReturn = _.cloneDeep(this.interactionData)
            dataToReturn.JS_PSYCH_DATA = JSON.stringify(dataToReturn.JS_PSYCH_DATA)
            return (JSON.stringify(dataToReturn))
        } else {
            return (this.interactionData)
        }
    }



    setValues(defaultSettings, newSettingsObj) {
        // If no data supplied, return.
        if (newSettingsObj === undefined) return;

        // For each key within the new settings object
        for (const key in newSettingsObj) {

            // Extract the data
            const new_data = newSettingsObj[key];

            // If new_data is empty warn
            if (new_data === undefined) {
                console.warn(`Parameter '${key}' has value of undefined.`);
                continue;
            }

            // Get the old data from the original settings object using the key from the new settings object
            const old_data = defaultSettings[key];

            // If the old data is undefined, that means
            if (old_data === undefined) {
                console.warn(`${key}' is not a recognisable setting parameter.`);
                continue;
            }

            // If the new_data is not null, replace the default setting
            if (new_data != null) {
                defaultSettings[key] = new_data;
            }
        }

    }

    setupToolbox() {
        // Create and setup global scene object
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.backgroundColor);
        if (globalSettings.enableAmbientLighting == true) {
            this.ambientLight = new THREE.AmbientLight(0x404040, 35); // soft white light
            this.scene.add(this.ambientLight);
        }

        // Setup global camera object
        this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.name = 'CAMERA'
        this.scene.add(this.camera)
        this.camera.layers.enableAll();

        // Setup global renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Setup controls
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);

        this.orbitControls.addEventListener('start', () => {
            this.isOrbiting = true;
        });

        this.orbitControls.addEventListener('end', () => {
            this.isOrbiting = false;
        });

        this.disableOrbitControls()
        this.disableDragControls()
        this.disableDragToRotateControls()
        this.disableMaskControls()


        // Create pointer to the canvas threejs uses.
        this.interactiveCanvas = this.renderer.domElement;
        this.interactiveCanvas.style.display = 'none';

        // Setup responsive display 
        if (globalSettings.responsiveDisplaySize == true) {
            window.addEventListener('resize', () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                this.renderer.setSize(w, h);
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();

                if (this.maskControlsEnabled) {
                    // Safely update aspect ratio and resize targets
                    if (this.finalPass && this.finalPass.uniforms.aspect) {
                        this.finalPass.uniforms.aspect.value = w / h;
                    }
                    if (this.sharpRT) {
                        this.sharpRT.setSize(w, h);
                    }
                    if (this.mainComposer) {
                        this.mainComposer.setSize(w, h);
                    }
                }
            });
        }

        // Setup pointer events
        window.addEventListener('pointerdown', (event) => {
            // If left button pressed
            if (event.button == 0) {
                // Raycast the scene 
                this.raycastScene()

                // Raycast will update a global variable - when the left mouse button is clicked, we select it
                this.selectedObject = this.currentRaycastObject;

                // Update pointer flags
                this.pointerDown = true;
                this.pointerUp = false;

                this._pointerDownCallback?.(event);
            } else {
                this._pointerDownCallback?.(event);
                return;
            }


        });

        // When button released
        window.addEventListener('pointerup', (event) => {

            // Reset currentRaycastObject
            this.currentRaycastObject = null;
            this.selectedObject = null

            // Update pointer flags
            this.pointerUp = true;
            this.pointerDown = false;

            this._pointerUpCallback?.(event);
        });

        // When the cursor is moved
        window.addEventListener('pointermove', (event) => {

            // calculate pointer position in normalized device coordinates
            // (-1 to +1) for both components
            this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

            this.mouseX = event.clientX;
            this.mouseY = event.clientY;


            // Calculate pointer delta
            this.pointerDelta.x = this.pointer.x - this.previousPointer.x;
            this.pointerDelta.y = (this.pointer.y) - this.previousPointer.y;

            // Raycast the scene
            this.raycastScene()

            // Function that processes control code depending on which controls are enabled or disbaled
            this.handleControls(event)

            // Log pointer position for delta calculations
            this.previousPointer.x = this.pointer.x;
            this.previousPointer.y = this.pointer.y;

            // fire the stored callback, if not null
            this._pointerMoveCallback?.(event);
        });

        // If mouse leaves the screen, reset cursor variables
        document.addEventListener("pointerleave", (event) => {

            if (event.clientY <= 0 || event.clientX <= 0 || (event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) {
                this.currentRaycastObject = null;
                this.selectedObject = null;
            }
        });

        this.jsPsychRunning = false

        // Attach other libraries as global objects 
        window.THREE = THREE
        window.jsPsych = initJsPsych({
            on_trial_start: function (trial) {
                this.jsPsychRunning = true;
            }
        });

        /*window.canvasKeyboardResponse = canvasKeyboardResponse
        window.canvasButtonResponse = canvasButtonResponse
        window.htmlKeyboardResponse = htmlKeyboardResponse
        window.htmlButtonResponse = htmlButtonResponse
        window.instructions = instructions*/
        window._ = _


    }

    onPointerMove(callback) {
        this._pointerMoveCallback = callback;
    }

    onPointerDown(callback) {
        this._pointerDownCallback = callback;
    }

    onPointerUp(callback) {
        this._pointerUpCallback = callback;
    }



    // Show the FPS counter
    showDebugStats() {
        this.checkStats = true
        this.stats.dom.style.display = 'flex'
    }

    // Hide the FPS counter
    hideDebugStats() {
        this.checkStats = false
        this.stats.dom.style.display = 'none'
    }

    // Disable controls
    disableControls() {
        this.helperControls = false
    }

    // Enable controls
    enableControls() {
        this.helperControls = true
    }

    enableFirstPersonControls(sensitivity = null) {
        this.disableOrbitControls()
        this.disableDragControls()
        this.disableDragToRotateControls()
        this.disableMaskControls()

        xAxis.set(1, 0, 0)
        yAxis.set(0, 1, 0)
        zAxis.set(0, 0, 1)

        if (sensitivity != null) {
            this.firstPersonMouseSensitivity = sensitivity
        }

        this.FPControlsEnabled = true;
        this.currentControls = 'FP'
    }

    disableFirstPersonControls() {
        this.FPControlsEnabled = false;
    }


    // Call relevant control functions
    handleControls(event) {
        // If enabled and within the bounds of the screen
        if (this.helperControls) {
            if (this.pointer.length() <= 1.41) {
                switch (true) {
                    case this.dragControlsEnabled:
                        this.dragControls(event, this.selectedObject)
                        break;
                    case this.orbitControlsEnabled:
                        this.orbitControls.update()
                        break;
                    case this.dragToRotateEnabled:
                        this.dragToRotate(event, this.selectedObject);
                        break
                    case this.maskControlsEnabled:
                        this.maskControlsPass(event)
                        break
                    case this.FPControlsEnabled:
                        this.firstPersonControls(event)
                        break
                }
            }

        }
    }

    raycastScene() {
        // Set raycast position and direction from the camera 
        this.raycaster.setFromCamera(this.pointer, this.camera);

        // calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObjects(this.stimuliInScene);

        // If we are intersecting an object...
        if (intersects.length > 0) {

            // Get the intersecting object
            const temp_selection = intersects[0].object


            // Loop through and select the top parent object of the intersecting object
            // This stops us from rotating/moving individual meshes within groups
            let temp = temp_selection;

            while (temp.parent && temp.parent !== this.scene && temp.parent !== temp.grid_parent) {
                temp = temp.parent;
            }

            this.currentRaycastObject = temp;

        } else {
            this.currentRaycastObject = null
        }
    }

    // Drag controls allow us to drag and drop an object
    // Right now, this locks the objects z position to what it is before the interaction occurs. 
    dragControls(event, obj = null) {
        if (obj != null) {
            if (this.pointerDown) {
                // Get the object's world position
                obj.getWorldPosition(worldPos);

                let pos = this.mouseToWorld(worldPos);
                obj.parent.worldToLocal(pos);
                obj.position.copy(pos);
                worldPos.set(0, 0, 0)
            }
        }
    }

    // Drag to rotate controls rotate objects with mouse movements
    // Click and drag to the left to rotate to the left etc.
    dragToRotate(event, obj = null) {
        if (obj != null) {
            if (this.pointerDown) {

                let sensitivity = this.dragToRotateSensitivity;
                let percentage = this.dragToRotateSensitivity / 100

                for (let i = 0; i < this.sensitivityFlags.length; i++) {
                    if (obj.name.includes(this.sensitivityFlags[i][0])) {
                        sensitivity = percentage * clamp(this.sensitivityFlags[i][1], 0, 100)
                        break;
                    }
                }

                //Allow the cube to rotate with mouse movements
                let xRotationAmount = (this.pointerDelta.x * sensitivity) * this.delta;
                let yRotationAmount = ((this.pointerDelta.y * sensitivity) * this.delta) * -1;

                // Camera-relative axes
                const cameraRight = xAxis.applyQuaternion(this.camera.quaternion);
                const cameraUp = yAxis.applyQuaternion(this.camera.quaternion);

                // Rotate relative to camera orientation
                obj.rotateOnWorldAxis(cameraUp, xRotationAmount);
                obj.rotateOnWorldAxis(cameraRight, yRotationAmount);

                xAxis.set(1, 0, 0) // Reset to default
                yAxis.set(0, 1, 0) // Reset to default
            }
        }
    }



    firstPersonControls(event) {
        if (this.pointerDown) {
            this.isPivoting = true
            this.camera.rotateOnWorldAxis(yAxis, this.pointerDelta.x * this.firstPersonMouseSensitivity);
            this.camera.rotateOnAxis(xAxis, this.pointerDelta.y * this.firstPersonMouseSensitivity);

            xAxis.set(1, 0, 0) // Reset to default
            yAxis.set(0, 1, 0) // Reset to default
        } else {
            this.isPivoting = false
        }
    }




    maskControlsPass(event, obj = null) {
        this.finalPass.uniforms.mouse.value.x = event.clientX / window.innerWidth;
        this.finalPass.uniforms.mouse.value.y = 1.0 - (event.clientY / window.innerHeight);
    }

    // Converts mouse position in pixels to a position within the 3D scene
    mouseToWorld(distanceTarget = null) {
        // distanceTarget determines how far away from the camera this position will be

        // Set world pointer to be x and y NDC 
        worldPointer.set(this.pointer.x, this.pointer.y, 0)

        // Convert NDC to world - This places the object at the position of the camera
        worldPointer.unproject(this.camera);

        // Subtract the camera position from it
        worldPointer.sub(this.camera.position).normalize();

        // Calculate how far away the object is 
        let distance
        if (distanceTarget == null) {
            // If no object provided, place the object at the zero point of the scene
            distance = this.camera.position.length()
        } else {
            // Else maintain its current distance
            distance = this.camera.position.distanceTo(distanceTarget)
        }

        // Add this distance to the coords
        worldPointer.multiplyScalar(distance)

        // Create final position
        this.worldPosition.copy(this.camera.position).add(worldPointer)//.multiplyScalar(distance));

        return (this.worldPosition);

    }

    // Find a object by name
    // The item has to be a threejs object
    findLoadedObject(name, arrayToSearch = null) {
        // If supplied with a specific array to search, it will do so 
        if (arrayToSearch != null) {
            return (arrayToSearch.find(obj => obj.name === name));
        } else {
            return (this.loadedModels.find(obj => obj.name === name));
        }
    }

    // Find a texture by name
    // The item has to be a threejs texture
    findLoadedTexture(name, arrayToSearch) {
        // If supplied with a specific array to search, it will do so 
        if (arrayToSearch != null) {
            return (arrayToSearch.find(obj => obj.name === name));
        } else {
            return (this.loadedTextures.find(obj => obj.name === name));
        }
    }


    // Build the loading screen
    setupLoadingScreen() {
        this.loadingScreen = document.createElement('div')
        this.loadingScreen.setAttribute('id', 'loadingScreen');

        this.loadingScreen.style.display = 'flex';
        this.loadingScreen.style.flexDirection = 'column';
        this.loadingScreen.style.gap = '15px';
        this.loadingScreen.style.position = 'absolute';
        this.loadingScreen.style.top = '0%';
        this.loadingScreen.style.width = '100vw';
        this.loadingScreen.style.zIndex = '1000';
        this.loadingScreen.style.height = '100vh';
        this.loadingScreen.style.backgroundColor = this.backgroundColor;
        this.loadingScreen.style.alignItems = 'center';
        this.loadingScreen.style.justifyContent = 'center';

        const loadingText = document.createElement('div')
        loadingText.setAttribute('id', 'loadingText');
        loadingText.innerText = 'Loading'

        const loader_style = document.createElement("style");
        loader_style.innerHTML = `
        .loader {
            width: 48px;
            height: 48px;
            display: inline-block;
            position: relative;
            transform: rotate(45deg);
            }
            .loader::before {
            content: '';  
            box-sizing: border-box;
            width: 24px;
            height: 24px;
            position: absolute;
            left: 0;
            top: -24px;
            animation: animloader 4s ease infinite;
            }
            .loader::after {
            content: '';  
            box-sizing: border-box;
            position: absolute;
            left: 0;
            top: 0;
            width: 24px;
            height: 24px;
            background: #ffffffd9;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
            animation: animloader2 2s ease infinite;
            }

            @keyframes animloader {
            0% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            12% {
                box-shadow: 0 24px white, 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            25% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            37% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px white, 0px 48px rgba(255, 255, 255, 0);
            }
            50% {
                box-shadow: 0 24px white, 24px 24px white, 24px 48px white, 0px 48px white;
            }
            62% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px white, 24px 48px white, 0px 48px white;
            }
            75% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px white, 0px 48px white;
            }
            87% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px white;
            }
            100% {
                box-shadow: 0 24px rgba(255, 255, 255, 0), 24px 24px rgba(255, 255, 255, 0), 24px 48px rgba(255, 255, 255, 0), 0px 48px rgba(255, 255, 255, 0);
            }
            }

            @keyframes animloader2 {
            0% {
                transform: translate(0, 0) rotateX(0) rotateY(0);
            }
            25% {
                transform: translate(100%, 0) rotateX(0) rotateY(180deg);
            }
            50% {
                transform: translate(100%, 100%) rotateX(-180deg) rotateY(180deg);
            }
            75% {
                transform: translate(0, 100%) rotateX(-180deg) rotateY(360deg);
            }
            100% {
                transform: translate(0, 0) rotateX(0) rotateY(360deg);
            }
            }
        `
        document.head.appendChild(loader_style);


        const loader = document.createElement('span')
        loader.setAttribute('class', 'loader');


        this.loadingScreen.appendChild(loadingText);
        this.loadingScreen.appendChild(loader);
        document.body.appendChild(this.loadingScreen);
        this.loadingScreen.style.display = 'none';
    }

    // BUG: Need to fix jitter - map it between 0 and 1 and make it work better with scaling issues.
    calculateGridPositionsInternal(settings) {
        let objectsToCheck

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            objectsToCheck = settings.stimuli
        } else {
            objectsToCheck = [settings.stimuli]
        }

        // If we have provided objects, pick the largest one for spacing
        if (objectsToCheck.length > 0) {
            // Create a vector to store the size
            const boundingBox = new THREE.Box3();
            let previousArea = 0
            const size = new THREE.Vector3();
            let finalSize = new THREE.Vector3();

            for (let i = 0; i < objectsToCheck.length; i++) {
                let obj = objectsToCheck[i]
                let originalRot = new THREE.Quaternion()
                originalRot.copy(obj.quaternion)
                obj.quaternion.identity();

                boundingBox.setFromObject(obj);
                boundingBox.getSize(size);

                let area = size.x * size.y

                if (previousArea < area) {
                    finalSize = size
                }

                previousArea = area

                obj.quaternion.copy(originalRot)
            }

            settings.itemWidth = size.x
            settings.itemHeight = size.y
        }

        let positions = []
        let nextEmptyPosition = 0

        // Total grid width and height
        // width of all columns + width of all spaces between columns
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;

        // height of all rows + height of all spaces between rows
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;

        // Calculate the area of the largest object (largest object is selected in previous step)
        let trueArea = settings.itemWidth * settings.itemHeight

        // Setup the grid object for debugging
        let debugGrid = new THREE.Group();
        debugGrid.layers.set(1); // So we can ignore it when raycasting 
        debugGrid.name = 'DEBUG_GRID_IGNORE';


        // Now calculate the actual positions within the grid - for each row go through each columns
        // For each row
        for (let row = 0; row < settings.rows; row++) {
            // For each column
            for (let col = 0; col < settings.columns; col++) {

                // Calculate the position of each box - centered around 0
                // Calculate where it should be along the x axis based on the current column it is, its width, and the set distance between columns
                // Calculate where it should be along the y axis based on the current column it is, its heigth, and the set distance between columns
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                // Apply the jitter (scaled to object size and randomly picks direction)
                let jitter = (settings.jitter * trueArea) * _.sample([-1, 1])

                // Calculate the position and create debug geometry
                let position = new THREE.Vector3(x + jitter, y + jitter, 0)
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set(1);
                debugGrid.add(plane)

                // Apply rotations to points based on which axis the camera has been translated along...
                switch (settings.cameraAxis) {
                    // Translated along X and looking at 0,0,0
                    case 'X':
                        position = position.applyAxisAngle(yAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateY(1.5708)
                        break
                    // Translated along Y and looking at 0,0,0
                    case 'Y':
                        position = position.applyAxisAngle(xAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateX(1.5708)
                        break
                    // Translated along Z and looking at 0,0,0
                    case 'Z':
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        break
                }
            }
        }

        this.scene.add(debugGrid)

        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }

        // Returns object that lists all positions, the next free empty slot, a pointer to the debug grid, and the number of rows and columns in the grid
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows: settings.rows, columns: settings.columns }
    }

    // BUG: Need to fix jitter - map it between 0 and 1 and make it work better with scaling issues.
    calculateGridPositions(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 0,
            cameraAxis: 'Z',
            showDebugGrid: false
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)

        let objectsToCheck

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            objectsToCheck = settings.stimuli
        } else {
            objectsToCheck = [settings.stimuli]
        }

        // If we have provided objects, pick the largest one for spacing
        if (objectsToCheck.length > 0) {
            // Create a vector to store the size
            const boundingBox = new THREE.Box3();
            let previousArea = 0
            const size = new THREE.Vector3();
            let finalSize = new THREE.Vector3();

            for (let i = 0; i < objectsToCheck.length; i++) {
                let obj = objectsToCheck[i]

                let originalRot = new THREE.Quaternion()
                originalRot.copy(obj.quaternion)
                obj.quaternion.identity();


                boundingBox.setFromObject(obj);
                boundingBox.getSize(size);

                let area = size.x * size.y

                if (previousArea < area) {
                    finalSize = size
                }

                previousArea = area

                obj.quaternion.copy(originalRot);
            }

            settings.itemWidth = size.x
            settings.itemHeight = size.y
        }

        let positions = []
        let nextEmptyPosition = 0

        // Total grid width and height
        // width of all columns + width of all spaces between columns
        const totalGridWidth = settings.columns * settings.itemWidth + (settings.columns - 1) * settings.distanceBetween;

        // height of all rows + height of all spaces between rows
        const totalGridHeight = settings.rows * settings.itemHeight + (settings.rows - 1) * settings.distanceBetween;

        // Calculate the area of the largest object (largest object is selected in previous step)
        let trueArea = settings.itemWidth * settings.itemHeight

        // Setup the grid object for debugging
        let debugGrid = new THREE.Group();
        debugGrid.layers.set(1); // So we can ignore it when raycasting 
        debugGrid.name = 'DEBUG_GRID_IGNORE';


        // Now calculate the actual positions within the grid - for each row go through each columns
        // For each row
        for (let row = 0; row < settings.rows; row++) {
            // For each column
            for (let col = 0; col < settings.columns; col++) {

                // Calculate the position of each box - centered around 0
                // Calculate where it should be along the x axis based on the current column it is, its width, and the set distance between columns
                // Calculate where it should be along the y axis based on the current column it is, its heigth, and the set distance between columns
                const x = -totalGridWidth / 2 + col * (settings.itemWidth + settings.distanceBetween) + settings.itemWidth / 2;
                const y = totalGridHeight / 2 - row * (settings.itemHeight + settings.distanceBetween) - settings.itemHeight / 2;

                // Apply the jitter (scaled to object size and randomly picks direction)
                let jitter = (settings.jitter * trueArea) * _.sample([-1, 1])

                // Calculate the position and create debug geometry
                let position = new THREE.Vector3(x + jitter, y + jitter, 0)
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight), new THREE.MeshBasicMaterial({ color: 0x117430, side: THREE.DoubleSide, wireframe: true }))
                plane.name = 'DEBUG_PLANE_IGNORE';
                plane.layers.set(1);
                debugGrid.add(plane)

                // Apply rotations to points based on which axis the camera has been translated along...
                switch (settings.cameraAxis) {
                    // Translated along X and looking at 0,0,0
                    case 'X':
                        position = position.applyAxisAngle(yAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateY(1.5708)
                        break
                    // Translated along Y and looking at 0,0,0
                    case 'Y':
                        position = position.applyAxisAngle(xAxis, 1.5708)
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        plane.rotateX(1.5708)
                        break
                    // Translated along Z and looking at 0,0,0
                    case 'Z':
                        positions.push(position)
                        plane.position.set(position.x, position.y, position.z)
                        break
                }
            }
        }

        this.scene.add(debugGrid)

        if (settings.showDebugGrid == true) { debugGrid.visible = true } else { debugGrid.visible = false }

        // Returns object that lists all positions, the next free empty slot, a pointer to the debug grid, and the number of rows and columns in the grid
        return { positions: positions, nextEmptyPosition: nextEmptyPosition, debugGrid: debugGrid, rows: settings.rows, columns: settings.columns }
    }

    placeOnGrid(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            gridObject: null,
            rows: 4,
            columns: 4,
            distanceBetween: 3,
            itemWidth: 1,
            itemHeight: 1,
            jitter: 0,
            cameraAxis: 'Z',
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            showDebugGrid: false,
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)



        let parentObj = new THREE.Group();
        let objectsToPlace, gridObject;

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        objectsToPlace = settings.stimuli

        if (settings.gridObject == null) {
            settings.gridObject = this.calculateGridPositionsInternal(settings)
        }

        console.log(settings)


        if (objectsToPlace.length > settings.gridObject.positions.length) {
            this.warningMessage("⚠️\nNot enough grid positions for total objects to place.\nIncrease rows or columns parameter or reduce number of stimuli.")
            return
        }

        // Randomise grid positions
        settings.gridObject.positions = _.shuffle(settings.gridObject.positions)

        objectsToPlace.forEach(object => {
            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }
            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }

            let pos = settings.gridObject.positions[settings.gridObject.nextEmptyPosition]
            object.position.set(pos.x, pos.y, pos.z)
            settings.gridObject.nextEmptyPosition++

            object.grid_parent = parentObj;

            this.addStimulusToScene(object)
            parentObj.add(object)
        });

        parentObj.add(settings.gridObject.debugGrid)
        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    placeOnManualGrid(userSettings = null) {
        // Default settings.
        let settings = {
            stimuli: [],
            gridObject: {},
            randomRotation: true,
            randomRotateX: false,
            randomRotateY: false,
            randomRotateZ: false,
            randomPlacement: false,
        }

        // If new parameters have been provided, set them.
        this.setValues(settings, userSettings)

        let parentObj = new THREE.Group();
        let objectsToPlace, gridObject;

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        objectsToPlace = settings.stimuli

        gridObject = settings.gridObject;

        if (objectsToPlace.length > gridObject.positions.length) {
            this.warningMessage("⚠️\nNot enough grid positions for total objects to place.\nIncrease rows or columns parameter or reduce number of stimuli.")
            return
        }


        if (settings.randomPlacement) {
            gridObject.positions = _.shuffle(gridObject.positions)
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                let pos = gridObject.positions[gridObject.nextEmptyPosition]
                object.position.set(pos.x, pos.y, pos.z)
                gridObject.nextEmptyPosition++

                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }
        if (settings.leftToRightTop) {
            // Row 1, col 1
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                object.position.set(gridObject.positions[gridObject.nextEmptyPosition].x, gridObject.positions[gridObject.nextEmptyPosition].y, gridObject.positions[gridObject.nextEmptyPosition].z)
                gridObject.nextEmptyPosition++
                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }
        if (settings.rightToLeftTop) {
            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                // Determine current row and column
                let cols = gridObject.columns;
                let row = Math.floor(gridObject.nextEmptyPosition / cols);
                let col = gridObject.nextEmptyPosition % cols;

                // Flip column to go right -> left
                let flippedCol = cols - 1 - col;

                // Compute the flat array index
                let index = row * cols + flippedCol;

                // Place the object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );
                gridObject.nextEmptyPosition++

                object.grid_parent = parentObj
                this.addStimulusToScene(object)
                parentObj.add(object)
            });


        }
        if (settings.leftToRightBottom) {
            let rows = gridObject.rows;
            let cols = gridObject.columns;

            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }

                // Row counting from bottom
                let row = rows - 1 - Math.floor(gridObject.nextEmptyPosition / cols);

                // Column left -> right
                let col = gridObject.nextEmptyPosition % cols;

                // Compute index in flat array
                let index = row * cols + col;

                // Place object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );

                gridObject.nextEmptyPosition++
                this.addStimulusToScene(object)
                parentObj.add(object)
            });

        }

        if (settings.rightToLeftBottom) {
            let rows = gridObject.rows;
            let cols = gridObject.columns;

            objectsToPlace.forEach(object => {
                if (settings.randomRotateX) {
                    object.rotation.x = _.random(0, 6.4, true);
                }
                if (settings.randomRotateY) {
                    object.rotation.y = _.random(0, 6.4, true);
                }
                if (settings.randomRotateZ) {
                    object.rotation.z = _.random(0, 6.4, true);
                }
                if (settings.randomRotation) {
                    object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
                }
                // Current row, counting from bottom
                let row = rows - 1 - Math.floor(gridObject.nextEmptyPosition / cols);

                // Current column, right -> left
                let col = cols - 1 - (gridObject.nextEmptyPosition % cols);

                // Compute flat array index
                let index = row * cols + col;

                // Place object
                object.position.set(
                    gridObject.positions[index].x,
                    gridObject.positions[index].y,
                    gridObject.positions[index].z
                );

                gridObject.nextEmptyPosition++
                object.grid_parent = parentObj

                this.addStimulusToScene(object)
                parentObj.add(object)
            });
        }

        parentObj.add(gridObject.debugGrid)
        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    preloadDefaultHDRI(pathToHDRI) {
        const hdrEquirectangularMap = new HDRLoader(this.preloadingManager);
        hdrEquirectangularMap.load(pathToHDRI, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            texture.name = pathToHDRI;
            this.loadedEnvs.push(texture)
            if (globalSettings.enableHDRI) {
                this.scene.environment = texture;
            }
        },
            undefined,
            (error) => { console.error('HDRI failed to load:', error); }
        );
    }

    preloadHDRI(pathToHDRI, applyHDRI = false) {
        const hdrEquirectangularMap = new HDRLoader(this.preloadingManager);

        for (let i = 0; i < pathToHDRI.length; i++) {
            const HDRI = pathToHDRI[i]

            hdrEquirectangularMap.load(HDRI, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.needsUpdate = true;
                texture.name = this.getFileName(HDRI);
                this.loadedEnvs.push(texture)

                if (applyHDRI) {
                    this.scene.environment = texture;
                }
            });

        }


    }

    preLoadTextures(texturesToLoad) {
        const textureLoader = new THREE.TextureLoader(this.preloadingManager);

        for (let i = 0; i < texturesToLoad.length; i++) {
            textureLoader.load(texturesToLoad[i], (texture) => {
                this.loadedTextures.push(texture)
            });
        }
    }

    getFileName(filePath) {
        return (filePath.split('/').at(-1).replace(/\.[^.]+$/, ''))
    }

    preLoadModels(modelsToLoad) {
        /////////////////////////////////////////////////////////////////////////
        // LOAD 3D MODELS ///////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////// 
        const objectLoader = new GLTFLoader(this.preloadingManager);
        //const arrayToSaveTo = []


        for (let i = 0; i < modelsToLoad.length; i++) {// Load a glTF resource
            objectLoader.load(
                // resource URL
                modelsToLoad[i],
                // called when the resource is loaded
                (gltf) => {
                    let model = gltf.scene;


                    const modelName = this.getFileName(modelsToLoad[i])
                    model.name = modelName
                    this.loadedModels.push(model)
                },

                function (xhr) {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                // called when loading has errors
                function (error) {
                    console.log('An error happened', error);
                }
            )
        };
        /////////////////////////////////////////////////////////////////////////
    }


    loadModel(modelsToLoad, showLoadingScreen = false) {

        if (showLoadingScreen) {
            this.turnOnLoadingScreen()
        }
        /////////////////////////////////////////////////////////////////////////
        // LOAD 3D MODELS ///////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////// 
        const objectLoader = new GLTFLoader(this.loadingManager);


        for (let i = 0; i < modelsToLoad.length; i++) {// Load a glTF resource
            objectLoader.load(
                // resource URL
                modelsToLoad[i],
                // called when the resource is loaded
                (gltf) => {
                    let model = gltf.scene;


                    const modelName = this.getFileName(modelsToLoad[i])
                    model.name = modelName
                    this.loadedModels.push(model)
                },

                function (xhr) {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                // called when loading has errors
                function (error) {
                    console.log('An error happened', error);
                }
            )
        };
        /////////////////////////////////////////////////////////////////////////
    }

    cloneObject(original_object) {
        let objectToReturn;

        if (Array.isArray(original_object)) {
            objectToReturn = [];
            original_object.forEach(function (item) {
                let object = item.clone()
                object.traverse(function (child) {
                    if (child.isMesh) {
                        child.material = child.material.clone()
                    }
                })
                objectToReturn.push(object);
            })
        } else {
            let object = original_object.clone()
            object.traverse(function (child) {
                if (child.isMesh) {
                    child.material = child.material.clone()
                }
            })
            object.name = original_object.name;
            objectToReturn = object;
        }

        return (objectToReturn)
    }

    addStimulusToScene(object) {
        this.scene.add(object);
        this.stimuliInScene.push(object);
    }

    removeStimulusFromScene(object) {
        this.scene.remove(object);
        this.stimuliInScene = this.stimuliInScene.filter(item => item !== object);
    }

    updateGazeControls() {

    }

    endTrial() {

        this.stopAnimationLoop()

        // Save interaction data internally
        this.interactionData["IST_TRIAL_INDEX"].push(this.currentTrialIndex)
        this.interactionData["SCENE_INFO"].push(this.currentSceneInfo)
        this.interactionData["INTERACTION_DATA"].push(this.singleTrialInteractionData)

        this.stimuliInScene.forEach(object => {
            this.removeStimulusFromScene(object)
        });
        this.interactiveCanvas.style.display = 'none'

        this.currentTrialIndex++;

        if (this.jsPsychRunning) {
            this.getCurrentTrialData_JSPsych().IST_TRIAL_INDEX = this.currentTrialIndex

            const jspsychData = this.getBehaviouralData()
            this.addGlobalData("JS_PSYCH_DATA", jspsychData, { stringify: false })
        }

    }

    getCurrentTrialData_JSPsych() {
        const jspsychData = jsPsych.data.get()
        const jsPsychCurrentTrialData = jspsychData.trials[jspsychData.trials.length - 1]
        return (jsPsychCurrentTrialData)
    }

    getBehaviouralData() {
        const jspsychData = jsPsych.data.get().trials
        return (jspsychData)
    }

    getBehavioralData() {
        const jspsychData = jsPsych.data.get().trials
        return (jspsychData)
    }

    animationLoop(time) {
        this.animationRequestID = requestAnimationFrame((time) => this.animationLoop(time));
        this.timer.update()
        this.currentFrameTime = this.experimentClock.getElapsedTime();


        if (this.maskControlsEnabled) {
            this.renderer.setRenderTarget(this.sharpRT);
            this.renderer.render(this.scene, this.camera);
            this.renderer.setRenderTarget(null);
            this.mainComposer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }


        this.collectData();

        this._updateCallback?.();
        //this.update() // Process loop - user can put their own code here

        this.delta = this.timer.getDelta();
        this.experimentClock.tick()

        if (this.checkStats) { this.stats.update(); }
    }


    addData(name, data, userSettings = null) {

        let settings = {
            stringify: false,
            addToJsPsych: true,
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }


        if (settings.stringify) {
            data = JSON.stringify(data)
        }

        //this.singleTrialInteractionData[name] = []
        this.singleTrialInteractionData[name] = data//.push(data);

        try {
            if (settings.addToJsPsych) {
                //this.getCurrentTrialData_JSPsych()[name] = []
                this.getCurrentTrialData_JSPsych()[name] = data
            }
        } catch (error) {
            console.error(error)
            console.warn("Did you call addData() outside of on_start() or on_finish()? addData() will only add data to the current trial's row. Data will not save if there is no row to save to. \n\nPerhaps you need to use addGlobalData()?")
        }
    }

    addGlobalData(name, data, userSettings = null) {

        let settings = {
            stringify: false
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        if (settings.stringify) {
            data = JSON.stringify(data)
        }

        try {
            this.interactionData[name] = []
            this.interactionData[name].push(data);
        } catch (error) {
            console.error(error)
        }



        //this.getCurrentTrialData_JSPsych()[name] = []
        //this.getCurrentTrialData_JSPsych()[name].push(data)
    }

    collectOrbitControlsData() {
        if (this.isOrbiting) {
            this.singleTrialInteractionData['INTERACTION_TIME'].push(this.currentFrameTime)
            this.singleTrialInteractionData['CURRENT_OBJECT'].push(this.camera.name)

            this.singleTrialInteractionData['X_POS'].push(this.camera.position.x)
            this.singleTrialInteractionData['Y_POS'].push(this.camera.position.y)
            this.singleTrialInteractionData['Z_POS'].push(this.camera.position.z)

            this.singleTrialInteractionData['X_ROT'].push(this.camera.quaternion.x)
            this.singleTrialInteractionData['Y_ROT'].push(this.camera.quaternion.y)
            this.singleTrialInteractionData['Z_ROT'].push(this.camera.quaternion.z)
            this.singleTrialInteractionData['W_ROT'].push(this.camera.quaternion.w)

            this.singleTrialInteractionData['MOUSE_X_POS'].push(this.mouseX)
            this.singleTrialInteractionData['MOUSE_Y_POS'].push(this.mouseY)
        }
    }

    collectFirstPersonControlsData() {
        if (this.isPivoting) {
            this.singleTrialInteractionData['INTERACTION_TIME'].push(this.currentFrameTime)
            this.singleTrialInteractionData['CURRENT_OBJECT'].push(this.camera.name)

            this.singleTrialInteractionData['X_POS'].push(this.camera.position.x)
            this.singleTrialInteractionData['Y_POS'].push(this.camera.position.y)
            this.singleTrialInteractionData['Z_POS'].push(this.camera.position.z)

            this.singleTrialInteractionData['X_ROT'].push(this.camera.quaternion.x)
            this.singleTrialInteractionData['Y_ROT'].push(this.camera.quaternion.y)
            this.singleTrialInteractionData['Z_ROT'].push(this.camera.quaternion.z)
            this.singleTrialInteractionData['W_ROT'].push(this.camera.quaternion.w)

            this.singleTrialInteractionData['MOUSE_X_POS'].push(this.mouseX)
            this.singleTrialInteractionData['MOUSE_Y_POS'].push(this.mouseY)
        }
    }

    collectMaskControlsData() {

        this.singleTrialInteractionData['MOUSE_X_POS'].push(this.mouseX)
        this.singleTrialInteractionData['MOUSE_Y_POS'].push(this.mouseY)

        if (this.currentRaycastObject) {
            if (this.currentRaycastObject.length > 0) {
                this.singleTrialInteractionData['INTERACTION_TIME'].push(this.currentFrameTime)
                this.singleTrialInteractionData['CURRENT_OBJECT'].push(this.currentRaycastObject.name)

                this.singleTrialInteractionData['X_POS'].push(this.currentRaycastObject.position.x)
                this.singleTrialInteractionData['Y_POS'].push(this.currentRaycastObject.position.y)
                this.singleTrialInteractionData['Z_POS'].push(this.currentRaycastObject.position.z)

                this.singleTrialInteractionData['X_ROT'].push(this.currentRaycastObject.quaternion.x)
                this.singleTrialInteractionData['Y_ROT'].push(this.currentRaycastObject.quaternion.y)
                this.singleTrialInteractionData['Z_ROT'].push(this.currentRaycastObject.quaternion.z)
                this.singleTrialInteractionData['W_ROT'].push(this.currentRaycastObject.quaternion.w)
            }
        }
    }
    collectDragControlsData() {
        if (this.selectedObject != null) {
            this.singleTrialInteractionData['INTERACTION_TIME'].push(this.currentFrameTime)
            this.singleTrialInteractionData['CURRENT_OBJECT'].push(this.selectedObject.name)

            this.singleTrialInteractionData['X_POS'].push(this.selectedObject.position.x)
            this.singleTrialInteractionData['Y_POS'].push(this.selectedObject.position.y)
            this.singleTrialInteractionData['Z_POS'].push(this.selectedObject.position.z)

            this.singleTrialInteractionData['X_ROT'].push(this.selectedObject.quaternion.x)
            this.singleTrialInteractionData['Y_ROT'].push(this.selectedObject.quaternion.y)
            this.singleTrialInteractionData['Z_ROT'].push(this.selectedObject.quaternion.z)
            this.singleTrialInteractionData['W_ROT'].push(this.selectedObject.quaternion.w)

            this.singleTrialInteractionData['MOUSE_X_POS'].push(this.mouseX)
            this.singleTrialInteractionData['MOUSE_Y_POS'].push(this.mouseY)
        }
    }

    collectDragToRotateControlsData() {
        if (this.selectedObject != null) {
            this.singleTrialInteractionData['INTERACTION_TIME'].push(this.currentFrameTime)
            this.singleTrialInteractionData['CURRENT_OBJECT'].push(this.selectedObject.name)

            this.singleTrialInteractionData['X_POS'].push(this.selectedObject.position.x)
            this.singleTrialInteractionData['Y_POS'].push(this.selectedObject.position.y)
            this.singleTrialInteractionData['Z_POS'].push(this.selectedObject.position.z)

            this.singleTrialInteractionData['X_ROT'].push(this.selectedObject.quaternion.x)
            this.singleTrialInteractionData['Y_ROT'].push(this.selectedObject.quaternion.y)
            this.singleTrialInteractionData['Z_ROT'].push(this.selectedObject.quaternion.z)
            this.singleTrialInteractionData['W_ROT'].push(this.selectedObject.quaternion.w)

            this.singleTrialInteractionData['MOUSE_X_POS'].push(this.mouseX)
            this.singleTrialInteractionData['MOUSE_Y_POS'].push(this.mouseY)
        }
    }

    collectData() {
        if (this.shouldCollectData) {

            if (this.realTimeTracking) {
                this.singleTrialInteractionData['TIMESTAMP'].push(this.currentFrameTime)
            }


            switch (this.currentControls) {
                case 'ORBIT':
                    this.collectOrbitControlsData()
                    break
                case 'FP':
                    this.collectFirstPersonControlsData()
                    break
                case 'DRAG':
                    this.collectDragControlsData()
                    break
                case 'DRAG_TO_ROTATE':
                    this.collectDragToRotateControlsData()
                    break
                case 'MASK':
                    this.collectMaskControlsData()
                    break
                default:
                    //console.log('no controls enabled')
                    break
            }


            // If using orbit controls, current object becomes the camera
            // If using drag and drop nothing changes
            // If using mask, change selectedObject to the raycast object since they can never click an object


        }
    }

    getSceneData() {
        const SCENE_INFO = []

        for (let i = 0; i < this.scene.children.length; i++) {
            const child = this.scene.children[i]


            if (child.isMesh | child.isGroup) {
                const jsonInfo = {
                    TYPE: child.type,
                    NAME: child.name,
                    POSITION: {
                        x: child.position.x,
                        y: child.position.y,
                        z: child.position.z
                    },
                    QUATERNION: {
                        x: child.quaternion.x,
                        y: child.quaternion.y,
                        z: child.quaternion.z,
                        w: child.quaternion.w
                    }

                }
                SCENE_INFO.push(jsonInfo);
            }

            else if (child.isLight) {
                const jsonInfo = {
                    TYPE: child.type,
                    POSITION: {
                        x: child.position.x,
                        y: child.position.y,
                        z: child.position.z
                    },
                    QUATERNION: {
                        x: child.quaternion.x,
                        y: child.quaternion.y,
                        z: child.quaternion.z,
                        w: child.quaternion.w
                    },
                    COLOR: '#' + child.color.getHexString()
                }
                SCENE_INFO.push(jsonInfo);
            }

            else if (child.isCamera) {
                const jsonInfo = {
                    TYPE: child.type,
                    POSITION: {
                        x: child.position.x,
                        y: child.position.y,
                        z: child.position.z
                    },
                    QUATERNION: {
                        x: child.quaternion.x,
                        y: child.quaternion.y,
                        z: child.quaternion.z,
                        w: child.quaternion.w
                    },
                    FOV: child.fov,
                    ASPECT: child.aspect,
                    NEAR: child.near,
                    FAR: child.far
                }
                SCENE_INFO.push(jsonInfo);
            }

        }

        return (SCENE_INFO)
    }


    update(callback) {
        this._updateCallback = callback;
    }


    startAnimationLoop() {
        if (this.animationRequestID != null) {
            this.stopAnimationLoop();
        }
        this.animationLoop();
    }

    stopAnimationLoop() {
        cancelAnimationFrame(this.animationRequestID)
    }

    startTrial() {
        //this.timer.start();
        // Reset interaction data per trial
        this.singleTrialInteractionData = {
            TIMESTAMP: [],
            INTERACTION_TIME: [],
            CURRENT_OBJECT: [],
            X_POS: [],
            Y_POS: [],
            Z_POS: [],
            X_ROT: [],
            Y_ROT: [],
            Z_ROT: [],
            W_ROT: [],
            MOUSE_X_POS: [],
            MOUSE_Y_POS: []
        }

        this.timer.dispose();
        this.timer = new THREE.Timer();
        this.timer.connect(document);
        //this.timer.start()

        this.experimentClock.stop();
        this.experimentClock.reset();
        this.experimentClock.start();

        this.startAnimationLoop();
        this.currentSceneInfo = this.getSceneData()
        this.interactiveCanvas.style.display = 'flex'
    }

    enableOrbitControls() {
        this.disableDragToRotateControls()
        this.disableDragControls()
        this.disableMaskControls()
        this.disableFirstPersonControls()

        xAxis.set(1, 0, 0)
        yAxis.set(0, 1, 0)
        zAxis.set(0, 0, 1)

        this.orbitControls.enabled = true;
        this.orbitControlsEnabled = true;
        this.currentControls = 'ORBIT'
    }

    disableOrbitControls() {
        this.orbitControls.enabled = false;
        this.orbitControlsEnabled = false;
        this.currentControls = null
    }

    enableDragControls() {
        this.disableOrbitControls()
        this.disableDragToRotateControls()
        this.disableMaskControls()
        this.disableFirstPersonControls()

        xAxis.set(1, 0, 0)
        yAxis.set(0, 1, 0)
        zAxis.set(0, 0, 1)

        this.currentControls = 'DRAG'

        this.dragControlsEnabled = true;

    }

    disableDragControls() {
        this.dragControlsEnabled = false;
        this.currentControls = null
    }

    enableDragToRotateControls(userSettings = null) {

        // Default settings
        let settings = {
            overallSensitivity: this.dragToRotateSensitivity,
            varySensitivity: false,
            sensitivityFlags: null
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)

            if (settings.overallSensitivity != this.dragToRotateSensitivity) {
                this.dragToRotateSensitivity = settings.overallSensitivity;
            }
        }

        if (settings.varySensitivity) {
            if (settings.sensitivityFlags != null) {
                this.sensitivityFlags = []


                // For each key value pair in sensitivity flags,
                Object.keys(settings.sensitivityFlags).forEach((key) => {
                    let flag_string = key;
                    let sensitivityVal = settings.sensitivityFlags[key];
                    this.sensitivityFlags.push([flag_string, sensitivityVal]);
                });
            }
        }


        this.disableOrbitControls()
        this.disableDragControls()
        this.disableMaskControls()
        this.disableFirstPersonControls()

        xAxis.set(1, 0, 0)
        yAxis.set(0, 1, 0)
        zAxis.set(0, 0, 1)



        this.currentControls = 'DRAG_TO_ROTATE'
        this.dragToRotateEnabled = true;
    }

    disableDragToRotateControls() {
        this.currentControls = null
        this.dragToRotateEnabled = false;
    }

    enableMaskControls(userSettings = null) {
        // Default settings
        let settings = {
            maskType: 'opaque',
            opacity: 1,
            maskRadius: 0.1,
            blurIntensity: 0.5,
            colour: '#093f63',
            tintBlur: false,
            tintAmount: 0.5,
            numberOfBlurPasses: 4,
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            if (userSettings.color !== undefined) {
                userSettings.colour = userSettings.color;
                delete userSettings.color;
            }
            this.setValues(settings, userSettings)
        }


        this.disableDragToRotateControls()
        this.disableDragControls()
        this.disableOrbitControls()
        this.disableFirstPersonControls()

        this.setupMask(settings);



        xAxis.set(1, 0, 0)
        yAxis.set(0, 1, 0)
        zAxis.set(0, 0, 1)

        this.maskControls = settings

        this.currentControls = 'MASK'
        this.maskControlsEnabled = true;

        console.log(this.maskControls)
    }

    setupMask(controlSettings) {
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());

        // Dedicated render target for the clean scene
        this.sharpRT = new THREE.WebGLRenderTarget(size.width, size.height, {
            samples: 4,
            type: THREE.HalfFloatType
        });

        this.mainComposer = new EffectComposer(this.renderer);

        // Render the main scene
        this.mainComposer.addPass(new RenderPass(this.scene, this.camera));

        // Apply blur if enabled
        if (controlSettings.maskType === 'blur') {
            for (let i = 0; i < controlSettings.numberOfBlurPasses; i++) {
                const hBlurPass = new ShaderPass(HorizontalBlurShader);
                const vBlurPass = new ShaderPass(VerticalBlurShader);

                hBlurPass.uniforms['h'].value = controlSettings.blurIntensity / window.innerWidth;
                vBlurPass.uniforms['v'].value = controlSettings.blurIntensity / window.innerHeight;

                this.mainComposer.addPass(hBlurPass);
                this.mainComposer.addPass(vBlurPass);
            }
        }

        // Pass that handles the cursor cutout
        this.finalPass = new ShaderPass(MaskShader);

        // Now pass the unmasked part to the shader
        this.finalPass.uniforms.tSharp.value = this.sharpRT.texture;

        // Map string to the integer the shader expects (0 = blur, 1 = opaque, 2 = transparent)
        let typeInt = 0;
        if (controlSettings.maskType.toLowerCase() === 'opaque') typeInt = 1;

        this.finalPass.uniforms.maskType.value = typeInt;

        // Set the visual properties (the shader will safely ignore color/alpha if it's set to blur)
        this.finalPass.uniforms.maskColor.value.set(new THREE.Color(controlSettings.colour));
        this.finalPass.uniforms.maskAlpha.value = controlSettings.opacity;
        this.finalPass.uniforms.radius.value = controlSettings.maskRadius;

        // Set aspect ratio here to ensure perfect circles on load
        this.finalPass.uniforms.aspect.value = window.innerWidth / window.innerHeight;

        // Add the cutout pass and gamma correction to finish the pipeline
        this.mainComposer.addPass(this.finalPass);
        this.mainComposer.addPass(new ShaderPass(GammaCorrectionShader));
    }


    setMaskColour(colour) {
        this.finalPass.uniforms.maskColor.value.set(colour) // Set the colour
    }

    setMaskRadius(size, softness = null) {
        this.finalPass.uniforms.radius.value = size

        if (softness != null) {
            this.finalPass.uniforms.softness.value = softness
        }
    }

    setBlurIntensity(amount) {
        if (this.maskControls) {
            this.maskControls.blurIntensity = amount
        }
    }

    disableMaskControls() {
        this.currentControls = null
        this.maskControlsEnabled = false;
    }

    turnOnLoadingScreen(textToDisplay = null) {
        if (textToDisplay) {
            document.getElementById('loadingText').innerHTML = textToDisplay
        }
        this.loadingScreen.style.display = 'flex';
    }

    turnOffLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    placeRandomly3D(userSettings = null) {
        // Default settings
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, randomRotateX: false, randomRotateY: false, randomRotateZ: false, ignoreCollisions: false
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        let objectsToPlace = settings.objectsToPlace
        let parentObj = new THREE.Group();

        let boundingBoxesInScene = []

        let keepChecking = true;
        let startTime = performance.now();
        let totalSuccesses = 0;

        for (const object of objectsToPlace) {
            let successfulPlacement = false;
            let collisions = false;
            let xPos = _.random(-settings.spread, settings.spread, true);
            let yPos = _.random(settings.spread, -settings.spread, true);
            let zPos = _.random(settings.spread, -settings.spread, true);


            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }

            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }


            object.position.set(xPos, yPos, zPos);
            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(object);

            if (boundingBoxesInScene.length === 0) {
                boundingBoxesInScene.push(boundingBox);
                successfulPlacement = true;
            }

            for (let i = 0; i < boundingBoxesInScene.length; i++) {
                let currentTime = performance.now() - startTime;

                if (currentTime > settings.timeout) {
                    break; // breaks the inner loop
                }

                if (settings.ignoreCollisions == false) {
                    let collision = boundingBox.intersectsBox(boundingBoxesInScene[i]);

                    if (collision) {
                        xPos = _.random(-settings.spread, settings.spread, true);
                        yPos = _.random(settings.spread, -settings.spread, true);
                        zPos = _.random(settings.spread, -settings.spread, true);
                        object.position.set(xPos, yPos, zPos);
                        boundingBox.setFromObject(object);
                        i = 0;
                    }


                    if (i === boundingBoxesInScene.length - 1 && !collisions) {
                        successfulPlacement = true;
                    }

                } else {
                    successfulPlacement = true;
                }

            }

            if (performance.now() - startTime > settings.timeout) {
                this.warningMessage("⚠️\nFailed to place all objects without collision. \nConsider decreasing stimuli size, increasing the 'spread' value, or setting 'ignoreCollisions' to true.")
                break;
            }

            if (successfulPlacement) {
                boundingBoxesInScene.push(boundingBox);
                object.grid_parent = parentObj
                this.addStimulusToScene(object);
                parentObj.add(object)
            }
        }

        this.addStimulusToScene(parentObj);
        return (parentObj)
    }

    placeRandomly2D(userSettings = null) {
        // Default settings
        let settings = {
            objectsToPlace: [], randomRotation: false,
            timeout: 1000, spread: 1, axisOrder: 'XY',
            randomRotateX: false, randomRotateY: false, randomRotateZ: false,
            ignoreCollisions: false
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        if (this.stimuliInScene.length > 0) {
            this.stimuliInScene.forEach(object => {
                this.removeStimulusFromScene(object)
            });
        }

        let axisOrder = settings.axisOrder

        let objectsToPlace = settings.objectsToPlace
        let parentObj = new THREE.Group();

        let boundingBoxesInScene = []

        let keepChecking = true;
        let startTime = performance.now();
        let totalSuccesses = 0;


        for (const object of objectsToPlace) {
            let successfulPlacement = false;
            let collisions = false;
            let xPos = _.random(-settings.spread, settings.spread, true);
            let yPos = _.random(settings.spread, -settings.spread, true);
            let zPos = _.random(settings.spread, -settings.spread, true);


            if (settings.randomRotateX) {
                object.rotation.x = _.random(0, 6.4, true);
            }
            if (settings.randomRotateY) {
                object.rotation.y = _.random(0, 6.4, true);
            }
            if (settings.randomRotateZ) {
                object.rotation.z = _.random(0, 6.4, true);
            }

            if (settings.randomRotation) {
                object.rotation.set(_.random(0, 6.4, true), _.random(0, 6.4, true), _.random(0, 6.4, true));
            }

            switch (axisOrder) {
                case 'YZ':
                    object.position.set(0, yPos, zPos);
                    break
                case 'ZY':
                    object.position.set(0, yPos, zPos);
                    break
                case 'XZ':
                    object.position.set(xPos, 0, zPos);
                    break
                case 'ZX':
                    object.position.set(xPos, 0, zPos);
                    break
                case 'XY':
                    object.position.set(xPos, yPos, 0);
                    break
                case 'YX':
                    object.position.set(xPos, yPos, 0);
                    break
                default:
                    object.position.set(xPos, yPos, 0);
            }

            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(object);

            if (boundingBoxesInScene.length === 0) {
                boundingBoxesInScene.push(boundingBox);
                successfulPlacement = true;
            }

            for (let i = 0; i < boundingBoxesInScene.length; i++) {
                let currentTime = performance.now() - startTime;

                if (currentTime > settings.timeout) {
                    break; // breaks the inner loop
                }

                if (settings.ignoreCollisions == false) {
                    let collision = boundingBox.intersectsBox(boundingBoxesInScene[i]);

                    if (collision) {
                        xPos = _.random(-settings.spread, settings.spread, true);
                        yPos = _.random(settings.spread, -settings.spread, true);
                        zPos = _.random(settings.spread, -settings.spread, true);
                        switch (axisOrder) {
                            case 'YZ':
                                object.position.set(0, yPos, zPos);
                                break
                            case 'ZY':
                                object.position.set(0, yPos, zPos);
                                break
                            case 'XZ':
                                object.position.set(xPos, 0, zPos);
                                break
                            case 'ZX':
                                object.position.set(xPos, 0, zPos);
                                break
                            case 'XY':
                                object.position.set(xPos, yPos, 0);
                                break
                            case 'YX':
                                object.position.set(xPos, yPos, 0);
                                break
                            default:
                                object.position.set(xPos, yPos, 0);
                        }
                        boundingBox.setFromObject(object);
                        i = 0;
                    }

                    if (i === boundingBoxesInScene.length - 1 && !collisions) {
                        successfulPlacement = true;
                    }

                } else {
                    successfulPlacement = true
                }

            }

            if (performance.now() - startTime > settings.timeout) {
                this.warningMessage("⚠️\nFailed to place all objects without collision. \nConsider decreasing stimuli size, increasing the 'spread' value, or setting 'ignoreCollisions' to true.")
                break; // breaks the main loop
            }

            if (successfulPlacement) {
                boundingBoxesInScene.push(boundingBox);
                object.grid_parent = parentObj
                this.addStimulusToScene(object);
                parentObj.add(object)
            }
        }

        this.addStimulusToScene(parentObj);
        return (parentObj);
    }

    placeInConcentricRings(userSettings = null) {
        // Default settings
        let settings = {
            stimuli: [],
            itemWidth: null,
            itemHeight: null,
            ringToUse: null,
            totalRings: 2,
            totalRingSections: 4,
            zPosition: 0,
            startingRadius: null,
            showDebugGrid: false,
            distanceBetweenRings: null,
            randomPosition: true,
            randomRotation: false,
            addToScene: true
        };

        // If new parameters have been provided, set them.
        if (userSettings != null) {
            this.setValues(settings, userSettings)
        }

        // If it's not an array, make it one.
        if (Array.isArray(settings.stimuli)) {
            settings.stimuli = settings.stimuli
        } else {
            settings.stimuli = [settings.stimuli]
        }

        if (settings.stimuli.length == 0) {
            this.warningMessage("Please include the objects you want to place!")
            return
        }

        const objects = settings.stimuli


        // Check if users have provided item width or height
        if (settings.itemWidth === null & settings.itemHeight === null) {
            // Find the largest object in the bunch
            if (objects.length > 0) {
                // Create a vector to store the size
                const boundingBox = new THREE.Box3();
                let previousArea = 0
                const size = new THREE.Vector3();
                let finalSize = new THREE.Vector3();

                for (let i = 0; i < objects.length; i++) {
                    let obj = objects[i]

                    let originalRot = new THREE.Quaternion()
                    originalRot.copy(obj.quaternion)
                    obj.quaternion.identity();




                    boundingBox.setFromObject(obj);
                    boundingBox.getSize(size);

                    let area = size.x * size.y

                    if (previousArea < area) {
                        finalSize = size
                    }

                    previousArea = area

                    obj.quaternion.copy(originalRot);
                }

                settings.itemWidth = size.x
                settings.itemHeight = size.y
            }

            if (settings.startingRadius === null) {
                settings.startingRadius = settings.itemWidth * settings.itemHeight
            }

            if (settings.distanceBetweenRings === null) {
                settings.distanceBetweenRings = (settings.itemWidth * settings.itemHeight) + 1
            }




        }

        if (settings.startingRadius === null) {
            settings.startingRadius = settings.itemWidth * settings.itemHeight
        }


        const rings = []
        const ringsUnique = []
        const n = settings.totalRingSections
        const halfStep = (360 / n) / 2

        for (let j = 0; j < settings.totalRings; j++) {
            const ringPositions = []
            const offsetDeg = j * halfStep
            const radius = settings.startingRadius + j * settings.distanceBetweenRings

            for (let i = 0; i < n; i++) {
                const angleDeg = (i / n) * 360 + offsetDeg
                const angleRad = degToRad(angleDeg - 90)

                const x = 0 + radius * Math.cos(angleRad)
                const y = 0 + radius * Math.sin(angleRad)

                if (settings.showDebugGrid == true & settings.addToScene == true) {
                    const geometry = new THREE.PlaneGeometry(settings.itemWidth, settings.itemHeight);
                    const material = new THREE.MeshBasicMaterial({ color: 0x117430, wireframe: true });
                    const cube = new THREE.Mesh(geometry, material);
                    cube.position.set(x, y, settings.zPosition)
                    this.addStimulusToScene(cube)
                }


                ringPositions.push([x, y, settings.zPosition])
                rings.push([x, y, settings.zPosition])
            }

            ringsUnique.push(ringPositions)

        }

        if (settings.randomRotation == true) {
            for (let i = 0; i < objects.length; i++) {
                objects[i].rotation.set(
                    _.random(degToRad(-360), degToRad(360)),
                    _.random(degToRad(-360), degToRad(360)),
                    _.random(degToRad(-360), degToRad(360))
                )
            }
        }

        if (settings.addToScene == true) {
            if (settings.ringToUse !== null) {
                const ring = ringsUnique[settings.ringToUse]

                if (objects.length > ring.length) {
                    this.warningMessage("Not enough spaces for stimuli!")
                    return
                }

                if (settings.randomPosition == true) {
                    const shuffled_ring = _.shuffle(ring)
                    for (let i = 0; i < objects.length; i++) {
                        const obj = objects[i]
                        obj.position.set(shuffled_ring[i][0], shuffled_ring[i][1], shuffled_ring[i][2])
                        this.addStimulusToScene(obj)
                    }
                } else {
                    for (let i = 0; i < objects.length; i++) {
                        const obj = objects[i]
                        obj.position.set(ring[i][0], ring[i][1], ring[i][2])
                        this.addStimulusToScene(obj)
                    }
                }

            } else {
                // Place randomly across rings

                if (objects.length > rings.length) {
                    this.warningMessage("Not enough spaces for stimuli!")
                    return
                }

                const ringPositions = _.shuffle(rings)

                for (let i = 0; i < objects.length; i++) {
                    const obj = objects[i]
                    obj.position.set(ringPositions[i][0], ringPositions[i][1], ringPositions[i][2])
                    this.addStimulusToScene(obj)
                }
            }

        }

        return ({ allRingPositionsCombined: rings, allRingPositionsUnique: ringsUnique })
    }


    setupWarningMessage() {
        // Create overlay container
        warningBox = document.createElement('div');
        warningBox.style.display = 'flex';
        warningBox.style.justifyContent = 'center';
        warningBox.style.alignItems = 'center';
        warningBox.style.width = '100vw';
        warningBox.style.height = '100vh';
        warningBox.style.position = 'fixed';
        warningBox.style.top = '0';
        warningBox.style.left = '0';
        warningBox.style.backgroundColor = 'rgba(0, 0, 0, 0.14)';
        warningBox.style.zIndex = '2000';
        warningBox.style.display = 'none';
        warningBox.style.backdropFilter = 'blur(5px)';

        // Create the actual warning box
        warningBoxText = document.createElement('div');
        warningBoxText.style.backgroundColor = '#fff3cd';
        warningBoxText.style.color = '#856404';
        warningBoxText.style.border = '1px solid #ffeeba';
        warningBoxText.style.padding = '10px 20px';
        warningBoxText.style.borderRadius = '6px';
        warningBoxText.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        warningBoxText.style.display = 'flex';
        warningBoxText.style.alignItems = 'center';
        warningBoxText.style.gap = '10px';
        warningBoxText.style.fontSize = '16px';
        warningBoxText.style.flexDirection = 'column';

        // Create text element (this is what you’ll update later)
        warningMessageText = document.createElement('span');
        warningMessageText.style.whiteSpace = 'pre-line';
        warningMessageText.style.textAlign = 'center';

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.backgroundColor = '#856404';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.padding = '6px 12px';
        closeBtn.style.fontSize = '16px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.transition = 'background-color 0.2s ease, transform 0.1s ease';

        // Optional hover/focus effects
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#b5880d';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = '#856404';
        });
        closeBtn.addEventListener('mousedown', () => {
            closeBtn.style.transform = 'scale(0.95)';
        });
        closeBtn.addEventListener('mouseup', () => {
            closeBtn.style.transform = 'scale(1)';
        });
        closeBtn.addEventListener('focus', () => {
            closeBtn.style.outline = '2px solid #b5880d';
        });
        closeBtn.addEventListener('blur', () => {
            closeBtn.style.outline = 'none';
        });

        // Close button functionality
        closeBtn.addEventListener('click', () => {
            warningBox.style.display = 'none';
        });

        // Put everything together
        warningBoxText.appendChild(warningMessageText);
        warningBoxText.appendChild(closeBtn);
        warningBox.appendChild(warningBoxText);
        document.body.appendChild(warningBox);
    }

    warningMessage(textToDisplay) {
        warningMessageText.textContent = textToDisplay;
        warningBox.style.display = 'flex';
    }

    setMaskSize(size) {
        this.maskControls.scale.set(size, size, size)
    }

    setMaskType(type) {
        if (!materialTypes.includes(type)) {
            console.warn(
                `'${type}' is not a mask type. Please choose from the following types: ${materialTypes.toString()}`
            );
            return
        } else {
            switch (type.toLowerCase()) {
                case 'blur':
                    console.log('blur')
                    break
                case 'opaque':
                    console.log('opaque')
                    break
                case 'transparent':
                    console.log('transparent')
                    break
            }
        }
    }

    setMaskColourOld(hexColour = null) {
        if (hexColour == null) {
            console.warn('Please provide a hex string')
            return
        } else {
            const colour = new THREE.Color().setHex(hexColour);
            if (colour.isColor) {
                //this.finalPass.uniforms.maskColor.value.set(colour) 
                //this.maskPlane.material.color = colour
            }
        }
    }

    setOverallDragToRotateSensitivity(value) {
        if (!isNaN(value)) {
            this.dragToRotateSensitivity = value
        } else {
            return
        }
    }

    getVisibleFaces(mesh, camera, faceNormals) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const cameraPosition = camera.position.clone();
        const visibleFaces = [];

        // Each facenormals object has a face name (e.g., right), a normal, and a center
        // right:  { normal, faceCenter: }
        for (const [face, { normal, faceCenter }] of Object.entries(faceNormals)) {

            // Convert normal and face center from local to world
            const worldNormal = normal.clone().applyMatrix3(normalMatrix).normalize();

            // Transform local face centre to world space this frame
            const worldFaceCenter = faceCenter.clone().applyMatrix4(mesh.matrixWorld);

            // Get distance from camera to the face's center point
            const toCamera = cameraPosition.clone().sub(worldFaceCenter);

            // If its dot produc is bigger than 0 then it is visible
            if (worldNormal.dot(toCamera) > 0) {
                const faceText = mesh.name + '_' + face
                visibleFaces.push(faceText);
            }
        }

        return visibleFaces;
    }

    getFaceNormals(mesh) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        const half = size.multiplyScalar(0.5);

        const center = new THREE.Vector3();
        box.getCenter(center);

        // Convert center to local space
        const localCenter = center.clone().applyMatrix4(mesh.matrixWorld.clone().invert());

        return {
            right: { normal: new THREE.Vector3(1, 0, 0), faceCenter: localCenter.clone().add(new THREE.Vector3(half.x, 0, 0)) },
            left: { normal: new THREE.Vector3(-1, 0, 0), faceCenter: localCenter.clone().add(new THREE.Vector3(-half.x, 0, 0)) },
            top: { normal: new THREE.Vector3(0, 1, 0), faceCenter: localCenter.clone().add(new THREE.Vector3(0, half.y, 0)) },
            bottom: { normal: new THREE.Vector3(0, -1, 0), faceCenter: localCenter.clone().add(new THREE.Vector3(0, -half.y, 0)) },
            front: { normal: new THREE.Vector3(0, 0, 1), faceCenter: localCenter.clone().add(new THREE.Vector3(0, 0, half.z)) },
            back: { normal: new THREE.Vector3(0, 0, -1), faceCenter: localCenter.clone().add(new THREE.Vector3(0, 0, -half.z)) },
        };
    }
}

window.InteractiveSearchToolbox = InteractiveSearchToolbox;
//export default InteractiveSearchToolbox;

import * as THREE from "../../libs/three.js/build/three.module.js";
import {EventDispatcher} from "../EventDispatcher.js";
import { XRControllerModelFactory } from '../../libs/three.js/webxr/XRControllerModelFactory.js';
import {Line2} from "../../libs/three.js/lines/Line2.js";
import {LineGeometry} from "../../libs/three.js/lines/LineGeometry.js";
import {LineMaterial} from "../../libs/three.js/lines/LineMaterial.js";
import {TextSprite} from "../TextSprite.js";
import { GLTFLoader } from "../../libs/three.js/loaders/GLTFLoader.js";
import KDBush from "../../libs/kdbush-4.0.2/index.js";

let fakeCam = new THREE.PerspectiveCamera();

function toScene(vec, ref){
	let node = ref.clone();
	node.updateMatrix();
	node.updateMatrixWorld();

	let result = vec.clone().applyMatrix4(node.matrix);
	result.z -= 0.8 * node.scale.x;
	// result.z = 4

	return result;
};

function computeMove(vrControls, controller){

	if(!controller || !controller.inputSource || !controller.inputSource.gamepad){
		return null;
	}

	let pad = controller.inputSource.gamepad;

	let axes = pad.axes;
	// [0,1] are for touchpad, [2,3] for thumbsticks?
	let y = 0;
	if(axes.length === 2){
		y = axes[1];
	}else if(axes.length === 4){
		y = axes[3];
	}

	y = Math.sign(y) * (2 * y) ** 2;

	let maxSize = 0;
	for(let pc of viewer.scene.pointclouds){
		let size = pc.boundingBox.min.distanceTo(pc.boundingBox.max);
		maxSize = Math.max(maxSize, size);
	}
	let sizeMultiplier = 1.5;
	let multiplicator = Math.pow(maxSize, 0.5) / 2 * sizeMultiplier;

	let scale = vrControls.node.scale.x;
	let speedMultiplier = 0.005;
	let moveSpeed = viewer.getMoveSpeed() * speedMultiplier;
	let amount = multiplicator * y * (moveSpeed ** 0.5) / scale;


	let rotation = new THREE.Quaternion().setFromEuler(controller.rotation);
	let dir = new THREE.Vector3(0, 0, -1);
	dir.applyQuaternion(rotation);

	let move = dir.clone().multiplyScalar(amount);

	let p1 = vrControls.toScene(controller.position);
	let p2 = vrControls.toScene(controller.position.clone().add(move));

	move = p2.clone().sub(p1);

	return move;
};

function computeRotation(vrControls, controller){

	if(!controller || !controller.inputSource || !controller.inputSource.gamepad){
		return null;
	}

	let pad = controller.inputSource.gamepad;
	let axes = pad.axes;

	let x = 0;
	if(axes.length >= 4){
		x = axes[2]; // x-axis of the right joystick
	}

	// Calculate rotation speed, scaling it for smoother control
	let rotationSpeed = 0.5; // Adjust this for faster or slower turning
	let angle = x * rotationSpeed;

	let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
	rotation.y = angle; // Rotate around the y-axis for left/right rotation

	return rotation;
}

function createPositionLabel(annotation) {
	// Get the position of the annotation
	const { x, y, z } = annotation.position;

	// Create a new TextSprite with the position text
	const label = new Potree.TextSprite(`${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);

	// Position the label near the annotation point
	label.position.copy(annotation.position); // Or adjust the position as needed for visibility

	// Add the label to the scene
	viewer.sceneVR.add(label);

	return label;
}

class FlyMode{

	constructor(vrControls){
		this.moveFactor = 1;
		this.dbgLabel = null;
	}

	start(vrControls){
		if(!this.dbgLabel){
			this.dbgLabel = new Potree.TextSprite("abc");
			this.dbgLabel.name = "debug label";
			vrControls.viewer.sceneVR.add(this.dbgLabel);
			this.dbgLabel.visible = false;
		}
	}

	end(){

	}

	update(vrControls, delta){

		let primary = vrControls.cPrimary;
		let secondary = vrControls.cSecondary;

		// Only calculate movement for the secondary controller
		let move2 = computeMove(vrControls, secondary, 1);

		if(!move2){
			move2 = new THREE.Vector3();
		}

		// Apply movement from secondary controller only
		let move = move2.clone();
		move.multiplyScalar(-delta * this.moveFactor);
		vrControls.node.position.add(move);

		// Apply rotation from the primary controller
		let rotation = computeRotation(vrControls, primary);
		if(rotation){
			vrControls.node.rotation.y -= rotation.y * delta; // Apply the rotation
		}

		let scale = vrControls.node.scale.x;

		let camVR = vrControls.viewer.renderer.xr.getCamera(fakeCam);

		let vrPos = camVR.getWorldPosition(new THREE.Vector3());
		let vrDir = camVR.getWorldDirection(new THREE.Vector3());
		let vrTarget = vrPos.clone().add(vrDir.multiplyScalar(scale));

		let scenePos = toScene(vrPos, vrControls.node);
		let sceneDir = toScene(vrPos.clone().add(vrDir), vrControls.node).sub(scenePos);
		sceneDir.normalize().multiplyScalar(scale);
		let sceneTarget = scenePos.clone().add(sceneDir);

		vrControls.viewer.scene.view.setView(scenePos, sceneTarget);

		if(Potree.debug.message){
			this.dbgLabel.visible = true;
			this.dbgLabel.setText(Potree.debug.message);
			this.dbgLabel.scale.set(0.1, 0.1, 0.1);
			this.dbgLabel.position.copy(primary.position);
		}
	}
};

class TranslationMode{

	constructor(){
		this.controller = null;
		this.startPos = null;
		this.debugLine = null;
	}

	start(vrControls){
		this.controller = vrControls.triggered.values().next().value;
		this.startPos = vrControls.node.position.clone();
	}

	end(vrControls){

	}

	update(vrControls, delta){

		let start = this.controller.start.position;
		let end = this.controller.position;

		start = vrControls.toScene(start);
		end = vrControls.toScene(end);

		let diff = end.clone().sub(start);
		diff.set(-diff.x, -diff.y, -diff.z);

		let pos = new THREE.Vector3().addVectors(this.startPos, diff);

		vrControls.node.position.copy(pos);
	}

};

class RotScaleMode{

	constructor(){
		this.line = null;
		this.startState = null;
	}

	start(vrControls){
		if(!this.line){
			this.line = Potree.Utils.debugLine(
				vrControls.viewer.sceneVR,
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(0, 0, 0),
				0xffff00,
			);

			this.dbgLabel = new Potree.TextSprite("abc");
			this.dbgLabel.scale.set(0.1, 0.1, 0.1);
			vrControls.viewer.sceneVR.add(this.dbgLabel);
		}

		this.line.node.visible = true;

		this.startState = vrControls.node.clone();
	}

	end(vrControls){
		this.line.node.visible = false;
		this.dbgLabel.visible = false;
	}

	update(vrControls, delta){

		let start_c1 = vrControls.cPrimary.start.position.clone();
		let start_c2 = vrControls.cSecondary.start.position.clone();
		let start_center = start_c1.clone().add(start_c2).multiplyScalar(0.5);
		let start_c1_c2 = start_c2.clone().sub(start_c1);
		let end_c1 = vrControls.cPrimary.position.clone();
		let end_c2 = vrControls.cSecondary.position.clone();
		let end_center = end_c1.clone().add(end_c2).multiplyScalar(0.5);
		let end_c1_c2 = end_c2.clone().sub(end_c1);

		let d1 = start_c1_c2.length();
		let d2 = end_c1_c2.length();

		let angleStart = new THREE.Vector2(start_c1_c2.x, start_c1_c2.z).angle();
		let angleEnd = new THREE.Vector2(end_c1_c2.x, end_c1_c2.z).angle();
		let angleDiff = angleEnd - angleStart;

		let scale = d2 / d1;

		let node = this.startState.clone();
		node.updateMatrix();
		node.matrixAutoUpdate = false;

		let mToOrigin = new THREE.Matrix4().makeTranslation(...toScene(start_center, this.startState).multiplyScalar(-1).toArray());
		let mToStart = new THREE.Matrix4().makeTranslation(...toScene(start_center, this.startState).toArray());
		let mRotate = new THREE.Matrix4().makeRotationZ(angleDiff);
		let mScale = new THREE.Matrix4().makeScale(1 / scale, 1 / scale, 1 / scale);

		node.applyMatrix4(mToOrigin);
		node.applyMatrix4(mRotate);
		node.applyMatrix4(mScale);
		node.applyMatrix4(mToStart);

		let oldScenePos = toScene(start_center, this.startState);
		let newScenePos = toScene(end_center, node);
		let toNew = oldScenePos.clone().sub(newScenePos);
		let mToNew = new THREE.Matrix4().makeTranslation(...toNew.toArray());
		node.applyMatrix4(mToNew);

		node.matrix.decompose(node.position, node.quaternion, node.scale );

		vrControls.node.position.copy(node.position);
		vrControls.node.quaternion.copy(node.quaternion);
		vrControls.node.scale.copy(node.scale);
		vrControls.node.updateMatrix();

		{
			let scale = vrControls.node.scale.x;
			let camVR = vrControls.viewer.renderer.xr.getCamera(fakeCam);

			let vrPos = camVR.getWorldPosition(new THREE.Vector3());
			let vrDir = camVR.getWorldDirection(new THREE.Vector3());
			let vrTarget = vrPos.clone().add(vrDir.multiplyScalar(scale));

			let scenePos = toScene(vrPos, this.startState);
			let sceneDir = toScene(vrPos.clone().add(vrDir), this.startState).sub(scenePos);
			sceneDir.normalize().multiplyScalar(scale);
			let sceneTarget = scenePos.clone().add(sceneDir);

			vrControls.viewer.scene.view.setView(scenePos, sceneTarget);
			vrControls.viewer.setMoveSpeed(scale);
		}

		{ // update "GUI"
			this.line.set(end_c1, end_c2);

			let scale = vrControls.node.scale.x;
			this.dbgLabel.visible = true;
			this.dbgLabel.position.copy(end_center);
			this.dbgLabel.setText(`scale: 1 : ${scale.toFixed(2)}`);
			this.dbgLabel.scale.set(0.05, 0.05, 0.05);
		}

	}

};




export class VRControls extends EventDispatcher {
	constructor(viewer) {
		super(viewer);
		this.viewer = viewer;
		this.rayLength = 2; // Initialize rayLength to 2
		this.maxRayLength = 10; // Initialize maxRayLength
		this.createPositionLabel = createPositionLabel;
		this.createTextSprite = TextSprite;
		this.gltfloader = new GLTFLoader();
		this.menu = null;
		this.meshVertices = [];

		this.points = [];
		this.lines = [];
		this.labels = [];

		this.labelScene = new THREE.Scene();

		viewer.addEventListener("vr_start", this.onStart.bind(this));
		viewer.addEventListener("vr_end", this.onEnd.bind(this));

		this.node = new THREE.Object3D();
		this.node.up.set(0, 0, 1);
		this.triggered = new Set();

		let xr = viewer.renderer.xr;

		const light = new THREE.PointLight(0xffffff, 5, 0, 1);
		light.position.set(0, 2, 0);
		this.viewer.sceneVR.add(light);

		this.menu = null;
		this.pointClouds = viewer.scene.pointclouds;

		const controllerModelFactory = new XRControllerModelFactory();
		this.setupController(xr, controllerModelFactory, 0);
		this.setupController(xr, controllerModelFactory, 1);

		this.mode_fly = new FlyMode();
		this.mode_translate = new TranslationMode();
		this.mode_rotScale = new RotScaleMode();
		this.setMode(this.mode_fly);
		this.inputGroundMeshes();
		// this.inputwallmeshes();

		this.buttonActions = {
			"Delete measurements": function() {
				// Remove all points from the scene
				for (let point of this.points) {
					this.viewer.scene.scene.remove(point);
				}
				// Clear the points array
				this.points = [];

				// Remove all lines from the scene
				for (let line of this.lines) {
					this.viewer.scene.scene.remove(line);
				}
				// Clear the lines array
				this.lines = [];

				// Remove all labels from the scene
				for (let label of this.labels) {
					this.viewer.scene.scene.remove(label);
				}
				// Clear the labels array
				this.labels = [];

				console.log("Measurements deleted");
			},
			"Button 2": function() {
				// Logic for Button 2
				console.log("Button 2 clicked");
			},
			"Button 3": function() {
				// Logic for Button 3
				console.log("Button 3 clicked");
			},
			"Button 4": function() {
				// Logic for Button 4
				console.log("Button 4 clicked");
			},
			"Button 5": function() {
				// Logic for Button 5
				console.log("Button 5 clicked");
			}
		};
	}

	inputGroundMeshes(){
		const loader = new GLTFLoader();

		loader.load("../meshes/ground_mesh.glb",(gltf) => {
			// Add the ground_mesh to the scene
			this.groundMesh = gltf.scene;
			// this.viewer.scene.scene.add(gltf.scene);
			// this.viewer.scene.scene.add(gltf.scene);

			console.log("GLB ground_mesh successfully loaded and added to the scene.");
			//bbox for ground mesh
			const bbox = new THREE.Box3().setFromObject(this.groundMesh);
			console.log("GLB Model 1 Bounding Box:", bbox);

			const geometry = gltf.scene.children[0].geometry; // Adjust based on your mesh structure
			const positionAttribute = geometry.attributes.position;

			// Read vertices as shown above
			for (let i = 0; i < positionAttribute.count; i++) {
				const vertex = new THREE.Vector3();
				vertex.fromBufferAttribute(positionAttribute, i);
				this.meshVertices.push({ x: vertex.x, y: vertex.y, z: vertex.z});
			}
			//const index = new KDBush(this.meshVertices, vertex => vertex.x, vertex => vertex.y);
		})

		// Add lighting to the scene
		{
			const directional = new THREE.DirectionalLight(0xffffff, 1.0);
			directional.position.set(10, 10, 10);
			directional.lookAt(0, 0, 0);

			const ambient = new THREE.AmbientLight(0x555555);

			this.viewer.scene.scene.add(directional);
			this.viewer.scene.scene.add(ambient);
		}


	}

	inputwallmeshes(){
		const loader = new GLTFLoader();

		loader.load("../meshes/non_ground_mesh.glb", (glb) => {
			let wall_mesh = glb.scene;

			// Set model position, scale, and rotation for the second model
			wall_mesh.position.set(0, 0, 0); // Adjust as needed for positioning
			wall_mesh.scale.set(1, 1, 1);      // Scale it as necessary
			wall_mesh.rotation.set(0, 0, 0); // Example rotation

			// Add the second model to the scene
			this.viewer.scene.scene.add(wall_mesh);

			// Compute and log bounding box for the second model
			let bbox2 = new THREE.Box3().setFromObject(wall_mesh);
			console.log("GLB Model 2 Bounding Box:");
			console.log("Min:", bbox2.min);
			console.log("Max:", bbox2.max);

			console.log("GLB Model 2 successfully loaded and added to the scene.");
		});
	}

	createMenu() {
		let menu = new THREE.Object3D();

		// Adjust menu box size to fit everything (title + buttons)
		let geometry = new THREE.BoxGeometry(1.2, 0.6, 0.001); // Reduced width and height for better fit
		let material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 });
		let mesh = new THREE.Mesh(geometry, material);
		menu.add(mesh);
		menu.position.set(0, 2, -1.5);

		// Create menu title
		this.createMenuTitle(menu);

		// Create individual buttons with specific labels, positioned higher
		this.createMenuButton(menu, "Delete measurements", -0.4, 0.05); // Adjusted yOffset to position higher
		this.createMenuButton(menu, "Button 2", 0, 0.05); // Adjusted yOffset to position higher
		this.createMenuButton(menu, "Button 3", 0.4, 0.05); // Adjusted yOffset to position higher
		this.createMenuButton(menu, "Button 4", -0.4, -0.1); // Adjusted yOffset to position higher
		this.createMenuButton(menu, "Button 5", 0.4, -0.1); // Adjusted yOffset to position higher

		return menu;
	}

	createMenuTitle(menu) {
		// Create a 2D canvas for the title text
		let canvas = document.createElement('canvas');
		let context = canvas.getContext('2d');

		// Set canvas size and text properties
		canvas.width = 512;
		canvas.height = 128;
		context.font = '48px Arial';  // Customize the font style and size
		context.textAlign = 'center';
		context.textBaseline = 'middle';

		// Set the text color
		context.fillStyle = 'white';
		context.strokeStyle = 'black';
		context.lineWidth = 6;

		// Draw the text outline first
		context.strokeText('Menu', canvas.width / 2, canvas.height / 2);

		// Fill the text
		context.fillText('Menu', canvas.width / 2, canvas.height / 2);

		// Create a texture from the canvas
		let texture = new THREE.CanvasTexture(canvas);

		// Create a material for the text
		let textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });

		// Create a plane geometry for the text
		let textPlaneGeometry = new THREE.PlaneGeometry(1, 0.2); // Adjust size to fit the menu width
		let textMesh = new THREE.Mesh(textPlaneGeometry, textMaterial);

		// Position the title on top of the menu
		textMesh.position.set(0, 0.3, 0.002); // Positioned above the buttons
		menu.add(textMesh);
	}

	createMenuButton(menu, labelText, xOffset, yOffset) {
		let button = new THREE.Object3D();

		// Create the button geometry with some depth for a 3D look
		let geometry = new THREE.BoxGeometry(0.35, 0.1, 0.02); // Reduced button size for better fit
		let material = new THREE.MeshPhongMaterial({
			color: 0x333333, // Dark color for the button
			shininess: 80,
			specular: 0x888888
		});
		let mesh = new THREE.Mesh(geometry, material);
		button.add(mesh);

		// Add lighting for better realism
		let ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
		let directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
		directionalLight.position.set(1, 1, 1).normalize();
		button.add(ambientLight);
		button.add(directionalLight);

		// Position the button
		button.position.set(xOffset, yOffset, 0.02); // Use xOffset and yOffset to determine button position

		// Create a 2D canvas for the text
		let canvas = document.createElement('canvas');
		let context = canvas.getContext('2d');

		// Set canvas size and text properties
		canvas.width = 256;
		canvas.height = 128; // Increased height for multi-line text
		context.font = '28px Arial';
		context.textAlign = 'center';
		context.textBaseline = 'middle';

		// Set text color
		context.fillStyle = 'white';
		context.strokeStyle = 'black';
		context.lineWidth = 5;

		// Split labelText if necessary and draw it on two lines if it contains multiple words
		const words = labelText.split(" ");
		const line1 = words[0];
		const line2 = words[1] || "";

		// Draw the text
		context.strokeText(line1, canvas.width / 2, canvas.height / 3);
		context.fillText(line1, canvas.width / 2, canvas.height / 3);

		if (line2) {
			context.strokeText(line2, canvas.width / 2, 2 * canvas.height / 3);
			context.fillText(line2, canvas.width / 2, 2 * canvas.height / 3);
		}

		// Create a texture from the canvas
		let texture = new THREE.CanvasTexture(canvas);

		// Create a material for the text
		let textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });

		// Create a plane geometry for the text
		let textPlaneGeometry = new THREE.PlaneGeometry(0.35, 0.1); // Adjust size to fit the button
		let textMesh = new THREE.Mesh(textPlaneGeometry, textMaterial);

		// Position the text plane on the button
		textMesh.position.set(0, 0, 0.021);
		button.add(textMesh);

		// Add the button to the menu
		menu.add(button);
		console.log("Button created and added to the menu.");
	}



	setupController(xr, controllerModelFactory, index) {
		let controller = xr.getController(index);
		let grip = xr.getControllerGrip(index);

		grip.add(controllerModelFactory.createControllerModel(grip));
		this.viewer.sceneVR.add(grip);

		let sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshNormalMaterial());
		sphere.scale.set(0.005, 0.005, 0.005);
		controller.add(sphere);
		controller.visible = true;
		this.viewer.sceneVR.add(controller);

		let lineGeometry = new LineGeometry();
		lineGeometry.setPositions([0, 0, -0.15, 0, 0, 0.05]);
		let lineMaterial = new LineMaterial({ color: 0xff0000, linewidth: 2, resolution: new THREE.Vector2(1000, 1000) });
		const line = new Line2(lineGeometry, lineMaterial);
		controller.add(line);

		controller.addEventListener('connected', (event) => {
			const xrInputSource = event.data;
			controller.inputSource = xrInputSource;
			if (index === 1) this.initMenu(controller);
		});

		controller.addEventListener('selectstart', () => { this.onTriggerStart(controller) });
		controller.addEventListener('selectend', () => { this.onTriggerEnd(controller) });
		controller.addEventListener('squeezestart', () => { this.onSqueezeStart(controller) });
		controller.addEventListener('squeezeend', () => { this.onSqueezeEnd(controller) });

		if (index === 0) {
			this.cPrimary = controller;
		} else {
			this.cSecondary = controller;
		}

		this.isSqueezing = false;
		this.squeezingController = null;
	}

	onSqueezeStart(controller) {
		if (controller === this.cSecondary) {
			this.isSqueezing = true;
			this.squeezingController = controller;
			this.updateRay();
		}
		if (controller === this.cPrimary) {
			this.squeezingController = controller;
			console.log('secondary squeeze start');
		}
	}

	onSqueezeEnd(controller) {
		this.isSqueezing = false;
		this.squeezingController = null;
	}

	toControllerScene(vec, controller) {
		if (!controller) {
			console.error("Controller parameter is required.");
			return null;
		}
		let controllerCamera = this.getControllerCamera(controller);
		let mat = controllerCamera.matrixWorld;
		let result = vec.clone().applyMatrix4(mat);
		return result;
	}

	toControllerVR(vec, controller) {
		let controllerCamera = this.getControllerCamera(controller);
		let mat = controllerCamera.matrixWorld;
		mat.invert();
		let result = vec.clone().applyMatrix4(mat);
		return result;
	}

	updateRay() {
		if (!this.isSqueezing || !this.squeezingController) {
			return;
		}

		//** In VR coordinates **//
		const controllerPosition = new THREE.Vector3();
		this.squeezingController.getWorldPosition(controllerPosition);
		const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.squeezingController.quaternion).normalize();

		//** In Scene coordinates **//
		const transformedPosition = this.toControllerScene(controllerPosition, this.squeezingController);
		const transformedDirection = this.toControllerScene(direction, this.squeezingController);


		//** Joystick control **//
		// Update ray length based on the left joystick
		if (this.cPrimary && this.cPrimary.inputSource && this.cPrimary.inputSource.gamepad) {
			const pad = this.cPrimary.inputSource.gamepad;
			const axes = pad.axes;
			console.log(pad)
			// Check if axes are available
			if (axes.length >= 4) {
				// axes 3 = y
				const leftJoystickY = axes[3];
				console.log(axes.length)
				console.log(axes)
				//minus because otherwise it's inverted
				// Adjust ray length based on joystick input
				this.rayLength = THREE.MathUtils.clamp(this.rayLength - leftJoystickY * 0.1, 0, this.maxRayLength);
			}
		}

		console.log('raylength', this.rayLength)
		//** Creation of Ray **//
		const rayOrigin = controllerPosition.clone();
		const rayDirection = direction.clone().multiplyScalar(this.rayLength);
		const endPoint = rayOrigin.clone().add(rayDirection);

		if (this.rayLine) {
			this.rayLine.geometry.setFromPoints([rayOrigin, endPoint]);
		} else {
			const rayGeometry = new THREE.BufferGeometry().setFromPoints([rayOrigin, endPoint]);
			const rayMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
			this.rayLine = new THREE.Line(rayGeometry, rayMaterial);
			this.viewer.sceneVR.add(this.rayLine);
		}

		if (!this.raySphere) {
			const sphereGeometry = new THREE.SphereGeometry(0.01, 32, 32);
			const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
			this.raySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
			this.viewer.sceneVR.add(this.raySphere);
		}
		this.raySphere.position.copy(endPoint);

	}


	createSlider(label, min, max){

		let sg = new THREE.SphereGeometry(1, 8, 8);
		let cg = new THREE.CylinderGeometry(1, 1, 1, 8);
		let matHandle = new THREE.MeshBasicMaterial({color: 0xff0000});
		let matScale = new THREE.MeshBasicMaterial({color: 0xff4444});
		let matValue = new THREE.MeshNormalMaterial();

		let node = new THREE.Object3D("slider");
		let nLabel = new Potree.TextSprite(`${label}: 0`);
		let nMax = new THREE.Mesh(sg, matHandle);
		let nMin = new THREE.Mesh(sg, matHandle);
		let nValue = new THREE.Mesh(sg, matValue);
		let nScale = new THREE.Mesh(cg, matScale);

		nLabel.scale.set(0.02, 0.02, 0.02);
		nLabel.position.set(0, 0.35, 0);

		nMax.scale.set(0.02, 0.02, 0.02);
		nMax.position.set(0, 0.25, 0);

		nMin.scale.set(0.02, 0.02, 0.02);
		nMin.position.set(0, -0.25, 0);

		nValue.scale.set(0.02, 0.02, 0.02);
		nValue.position.set(0, 0, 0);

		nScale.scale.set(0.005, 0.5, 0.005);

		node.add(nLabel);
		node.add(nMax);
		node.add(nMin);
		node.add(nValue);
		node.add(nScale);

		return node;
	}

	createInfo(){

		let texture = new THREE.TextureLoader().load(`${Potree.resourcePath}/images/vr_controller_help.jpg`);
		let plane = new THREE.PlaneBufferGeometry(1, 1, 1, 1);
		let infoMaterial = new THREE.MeshBasicMaterial({map: texture});
		let infoNode = new THREE.Mesh(plane, infoMaterial);

		return infoNode;
	}

	initMenu(controller){

		// if(this.menu){
		//	return;
		// }

		// Always create a new menu node
		let node = new THREE.Object3D("vr menu");

		// Create and configure the menu components (uncomment and customize as needed)
		let nSlider = this.createSlider("speed", 0, 1);  // Slider from 0 to 1 (speed controller)
		let nInfo = this.createInfo();                   // Info panel

		// Add the components to the menu node
		node.add(nSlider);  // Add slider to the menu node
		node.add(nInfo);    // Add info panel to the menu node

		// Set the node's rotation, scale, and position
		node.rotation.set(-1.5, 0, 0);  // Adjust rotation
		node.scale.set(0.3, 0.3, 0.3);  // Adjust scale
		node.position.set(-0.2, -0.002, -0.1);  // Adjust position relative to the controller or user

		// Customize specific component positions if needed
		nInfo.position.set(0.5, 0, 0);  // Position the info panel within the node
		nInfo.scale.set(0.8, 0.6, 0);   // Adjust the scale of the info panel

		// Optionally attach the menu node to the controller so it moves with it
		controller.add(node);  // Attach the node to the VR controller

		// If you want the menu to be placed in the world at a fixed position:
		// node.position.set(-0.3, 1.2, 0.2);  // Example world position
		// node.lookAt(new THREE.Vector3(0, 1.5, 0.1));  // Make the menu face a specific point (e.g., the user's eye level)

		// Add the menu to the VR scene so it becomes visible
		this.viewer.sceneVR.add(node);

		// Store a reference to the menu globally and in the class (optional, useful for future interaction)
		this.menu = node;
		window.vrMenu = node;

		// Optional: Expose the slider globally if you need external access
		window.vrSlider = nSlider;
	}

	toScene(vec){
		let camVR = this.getCamera();

		let mat = camVR.matrixWorld;
		let result = vec.clone().applyMatrix4(mat);

		return result;
	}

	toVR(vec){
		let camVR = this.getCamera();

		let mat = camVR.matrixWorld.clone();
		mat.invert();
		let result = vec.clone().applyMatrix4(mat);

		return result;
	}

	setMode(mode){

		if(this.mode === mode){
			return;
		}

		if(this.mode){
			this.mode.end(this);
		}

		for(let controller of [this.cPrimary, this.cSecondary]){

			let start = {
				position: controller.position.clone(),
				rotation: controller.rotation.clone(),
			};

			controller.start = start;
		}

		this.mode = mode;
		this.mode.start(this);
	}

	calculateDistance(point1, point2) {
		const dx = point1.x - point2.x;
		const dy = point1.y - point2.y;
		const dz = point1.z - point2.z;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
		return parseFloat(distance.toFixed(2));
	}

	calculateArea(points) {
		if (points.length < 3) {
			console.error('At least three points are required to calculate an area.');
			return 0;
		}

		let areaXY = 0, areaYZ = 0, areaZX = 0;
		const n = points.length;

		for (let i = 0; i < n; i++) {
			const { x: x1, y: y1, z: z1 } = points[i];
			const { x: x2, y: y2, z: z2 } = points[(i + 1) % n];

			areaXY += x1 * y2 - x2 * y1;
			areaYZ += y1 * z2 - y2 * z1;
			areaZX += z1 * x2 - z2 * x1;
		}

		areaXY = Math.abs(areaXY / 2);
		areaYZ = Math.abs(areaYZ / 2);
		areaZX = Math.abs(areaZX / 2);

		// Combine the areas of the projections
		const totalArea = Math.sqrt(areaXY * areaXY + areaYZ * areaYZ + areaZX * areaZX);
		return parseFloat(totalArea.toFixed(2));
	}

	colorArea(points, color = 0xff0000) {
		if (points.length < 3) {
			console.error('At least three points are required to color an area.');
			return;
		}

		// Remove existing area drawing if it exists
		if (this.areaDrawing) {
			this.viewer.scene.scene.remove(this.areaDrawing);
		}

		// Remove existing label if it exists
		if (this.areaLabel) {
			this.viewer.scene.scene.remove(this.areaLabel);
		}

		// Create a geometry from the points
		const geometry = new THREE.BufferGeometry().setFromPoints(points);

		// Create a material with the desired color
		const material = new THREE.LineBasicMaterial({ color: color });

		// Create a line from the geometry and material
		const line = new THREE.LineLoop(geometry, material);

		// Add the line to the scene
		this.viewer.scene.scene.add(line);

		this.lines.push(line)

		// Store the line for future reference
		this.areaDrawing = line;
	}

	createLabel(object, type, Unit) {
		let labelText = '';

		if (type === 'point') {
			const { x, y, z } = object.position;
			labelText = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
		} else if (type === 'line') {
			labelText = `${Unit} m`;
		} else if (type === 'area') {
			labelText = `${Unit} m^2`;
		}

		else {
			console.error('Invalid type specified for createLabel');
			return null;
		}

		const label = new this.createTextSprite(labelText);

		// Position the label near the object
		if (type === 'point') {
			label.position.copy(object.position);
		} else if (type === 'line') {
			const midPoint = new THREE.Vector3().addVectors(object.start, object.end).multiplyScalar(0.5);
			label.position.copy(midPoint);
		} else if (type === 'area') {
			label.position.copy(object.position);
		}

		// put the label above the point
		label.position.z += 0.1;

		this.labels.push(label)

		return label
	}

	createSphereAndLabel() {
		// Create a new circle mesh
		const newCircle = new THREE.Mesh(
			new THREE.SphereGeometry(0.01, 32, 32),
			new THREE.MeshBasicMaterial({ color: 0xff0000 })
		);

		newCircle.position.copy(this.raySphere.position);
		const transformedPosition = this.toScene(newCircle.position);
		newCircle.position.copy(transformedPosition);

		newCircle.position.z -= 0.8 * this.node.scale.x;

		// Add the new circle to the scene
		this.viewer.scene.scene.add(newCircle);
		console.log('New circle created at:', newCircle.position);

		// Get the position of the new point
		const newPointPosition = newCircle.position.clone();

		// Create a label for the new point
		const pointlabel = this.createLabel(newCircle, 'point');
		this.viewer.scene.scene.add(pointlabel)

		// If there's a previous point, create a line and calculate the distance
		if (this.points.length > 0) {
			const lastPointPosition = this.points[this.points.length - 1];

			// Create a line between the last point and the new point
			const geometry = new THREE.BufferGeometry().setFromPoints([lastPointPosition, newPointPosition]);
			const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
			const line = new THREE.Line(geometry, material);
			this.viewer.scene.scene.add(line);

			// Calculate the distance between the last point and the new point
			const distance = this.calculateDistance(lastPointPosition, newPointPosition);
			console.log('Distance between points:', distance);

			// Create a label for the line
			const linelabel = this.createLabel({ start: lastPointPosition, end: newPointPosition }, 'line', distance);
			this.viewer.scene.scene.add(linelabel);
			this.lines.push(line)
		}

		this.points.push(newPointPosition);

		if (this.points.length > 2) {
			const area = this.calculateArea(this.points);
			console.log('Area of the polygon:', area);
			this.colorArea(this.points, 0x0000ff);

			// Remove existing label if it exists
			if (this.areaLabel) {
				this.viewer.scene.scene.remove(this.areaLabel);
			}

			// Calculate the centroid of the area for label positioning
			const centroid = new THREE.Vector3();
			this.points.forEach(point => centroid.add(point));
			centroid.divideScalar(this.points.length);

			const areaLabel = this.createLabel({ position: centroid }, 'area', area);

			this.viewer.scene.scene.add(areaLabel)

			this.areaLabel = areaLabel;
		}

	}

	onTriggerStart(controller) {
		if (controller === this.cSecondary) {
			// Check if the controller is squeezing
			if (this.isSqueezing && this.squeezingController === controller) {
				console.log("Trigger pressed, creating new circle", controller);
				this.createSphereAndLabel();
			}
		}

		if (controller === this.cPrimary) {
			// Check if menu is active
			if (this.menu) {
				this.viewer.sceneVR.remove(this.menu);
				this.menu = null;
			} else {
				this.menu = this.createMenu();
				this.viewer.sceneVR.add(this.menu);
			}
			this.buttonActions["Delete measurements"].call(this);
		}

		if (this.triggered.size === 0) {
			this.setMode(this.mode_fly);
		} else if (this.triggered.size === 1) {
			this.setMode(this.mode_translate);
		} else if (this.triggered.size === 2) {
			this.setMode(this.mode_rotScale);
		}
	}


	onTriggerEnd(controller){
		this.triggered.delete(controller);

		if(this.triggered.size === 0){
			this.setMode(this.mode_fly);
		}else if(this.triggered.size === 1){
			this.setMode(this.mode_translate);
		}else if(this.triggered.size === 2){
			this.setMode(this.mode_rotScale);
		}
	}


	onStart(){
		// Define your fixed XYZ position here
		let fixedPosition = new THREE.Vector3(5700, 339900, 7); // Replace with your desired x, y, z values

		// You don't need to compute position from the viewer.scene.view, just use the fixed position
		this.node.position.copy(fixedPosition);

		// You can set a fixed direction for the camera to look at, or target a specific point
		let fixedTarget = new THREE.Vector3(0, 0, 0); // Replace with where you want the camera to look
		this.node.lookAt(fixedTarget);

		// Set the scale based on move speed (you can customize this as needed)
		// let scale = this.viewer.getMoveSpeed();
		let scale = 1
		this.node.scale.set(scale, scale, scale);

		// Ensure the camera's transformation matrix is updated
		this.node.updateMatrix();
		this.node.updateMatrixWorld();
	}


	onEnd(){

	}


	setScene(scene){
		this.scene = scene;
	}

	distanceSq(x1, y1, x2, y2) {
		return (x1 - x2) ** 2 + (y1 - y2) ** 2;
	}

	getGroundHeight(x, y) {
		// Define your vertices array here
		const index = new KDBush(this.meshVertices.length);

		// Add each vertex to the KDBush index
		for (const { x, y } of this.meshVertices) {
            index.add(x, y);
        }

        index.finish();

		// Define your query point (x_query, y_query)
		let x_query = x;
		let y_query = y;

		// Example radius query
		const radius = 1; // Adjust the radius as necessary
		const neighborIds = index.within(x_query, y_query, radius);
		const neighborItems = neighborIds.map(i => this.meshVertices[i]);

		const neighborZValues = neighborIds.map(i => this.meshVertices[i].z);

		// Compute the average z value
		const averageZ = neighborZValues.length > 0
			? neighborZValues.reduce((sum, z) => sum + z, 0) / neighborZValues.length
			: 0; // Handle case with no neighbors

		return averageZ;
	}

	getCamera(){
		let reference = this.viewer.scene.getActiveCamera();
		let camera = new THREE.PerspectiveCamera();

		// let scale = this.node.scale.x;
		let scale = this.viewer.getMoveSpeed();
		//camera.near = 0.01 / scale;
		camera.near = 0.1;
		camera.far = 1000;
		// camera.near = reference.near / scale;
		// camera.far = reference.far / scale;
		camera.up.set(0, 0, 1);
		camera.lookAt(new THREE.Vector3(0, -1, 0));
		camera.updateMatrix();
		camera.updateMatrixWorld();

		// Set your custom z-value here
		camera.position.copy(this.node.position);
		camera.position.z = 6;
		/*
		const x = this.node.position.x;
		const y = this.node.position.y;
		camera.position.z = this.getGroundHeight(x, y) + 1.8;
		console.log('cam height', camera.position.z)
		/*
		const x = this.node.position.x;
		const y = this.node.position.y;
		const height = this.getGroundHeight(x, y);
		if (height) {
			camera.position.z = height + 1.5; // Set this to your desired value
		} else {
			camera.position.z = 5.5; // Default height if no ground height is found
		}
		*/

		// console.log('cam heigt', camera.position.z)// Set this to your desired value

		camera.rotation.copy(this.node.rotation);
		camera.scale.set(scale, scale, scale);
		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.matrixAutoUpdate = false;
		camera.parent = camera;

		return camera;
	}

	getControllerCamera(controller) {
		// Ensure the controller is valid
		if (!controller) {
			console.error("Controller parameter is required.");
			return null; // or handle the error as needed
		}

		// Create a new PerspectiveCamera for the controller
		let controllerCamera = new THREE.PerspectiveCamera();

		// Set the near and far clipping planes
		controllerCamera.near = 0.1; // Near clipping plane
		controllerCamera.far = 1000;  // Far clipping plane

		// Set the up direction of the controller camera
		controllerCamera.up.set(0, 0, 1); // Adjust based on your VR setup

		// Set the camera to look in the direction of the controller
		controllerCamera.lookAt(new THREE.Vector3(0, 0, -1)); // Get direction from controller

		// Update the camera's transformation matrix
		controllerCamera.updateMatrix();

		// Set the position and rotation from the controller
		controllerCamera.position.copy(this.node.position.clone().sub(controller.position));
		controllerCamera.rotation.copy(controller.rotation); // Use controller's rotation

		// Set scale if needed (controllers typically are not scaled like cameras)
		controllerCamera.scale.set(1, 1, 1); // Standard scale for controller cameras

		// Update matrix world for the controller camera
		controllerCamera.updateMatrixWorld();

		// Optional: Disable automatic matrix updates if needed
		controllerCamera.matrixAutoUpdate = true;

		return controllerCamera; // Return the configured controller camera
	}


	update(delta){



		// if(this.mode === this.mode_fly){
		// let ray = new THREE.Ray(origin, direction);

		// for(let object of this.selectables){

		// if(object.intersectsRay(ray)){
		// object.onHit(ray);
		// }

		// }

		// }
		this.updateRay();
		this.mode.update(this, delta);
	}
};
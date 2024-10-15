
import * as THREE from "../../libs/three.js/build/three.module.js";
import {EventDispatcher} from "../EventDispatcher.js";
import { XRControllerModelFactory } from '../../libs/three.js/webxr/XRControllerModelFactory.js';
import {Line2} from "../../libs/three.js/lines/Line2.js";
import {LineGeometry} from "../../libs/three.js/lines/LineGeometry.js";
import {LineMaterial} from "../../libs/three.js/lines/LineMaterial.js";

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
		console.log("Squeeze activated", controller);
		this.isSqueezing = true;
		this.squeezingController = controller;
		this.updateRay();
	}

	onSqueezeEnd(controller) {
		console.log("Squeeze released", controller);
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
		const pad = this.squeezingController.inputSource.gamepad;
		const axes = pad.axes;
		const joystickValue = axes.length >= 2 ? axes[1] : 0;
		this.rayLength = THREE.MathUtils.clamp(this.rayLength + joystickValue * 0.1, 0, this.maxRayLength);

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


		//** create position label **//
		//const annotation = { position: endPoint };
		//this.createPositionLabel(annotation);
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

	onTriggerStart(controller) {
		console.log("Trigger pressed, creating new circle", controller);

		// Create a new circle mesh
		const newCircle = new THREE.Mesh(
			new THREE.SphereGeometry(0.01, 32, 32),
			new THREE.MeshBasicMaterial({ color: 0xff0000 })
		);

		newCircle.position.copy(this.raySphere.position);
		const transformedPosition = this.toScene(newCircle.position);
		newCircle.position.copy(transformedPosition);
		console.log('untransformed z', this.raySphere.position.z)
		console.log('transformed z', transformedPosition.z)

		newCircle.position.z -= 0.8 * this.node.scale.x;
		console.log('new z', newCircle.position.z)
		// Add the new circle to the scene
		this.viewer.scene.scene.add(newCircle);

		// ** new ** //
		/*
		const { x, y, z } = newCircle.position;

		// Create a new TextSprite with the position text
		const label = new Potree.TextSprite(`${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);

		// Position the label near the annotation point
		label.position.copy(newCircle.position); // Or adjust the position as needed for visibility

		// Add the label to the scene
		viewer.scene.scene.add(label);
		 */

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
		camera.position.z = 7; // Set this to your desired value

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
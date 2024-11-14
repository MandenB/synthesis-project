# Explorative Point Cloud Virtual Reality: Immersive Visual Insight
# VR additions to Potree
This project extends the Potree WebGL-based point cloud renderer with enhanced Virtual Reality (VR) functionalities to provide improved navigation and measurement experiences. Built by a group of five students as part of the Geomatics Synthesis Project at TU Delft and in collaboration with GeoDelta, this project aims to address the research question:

"How does the use of Virtual Reality, compared to GeoDelta's Omnibase Multi-view, affect user perception, interaction, and measurement accuracy in point cloud environments?"

# Features
The project introduces new VR interactions and improvements within Potree’s VRControls.js file:

- **Joystick Navigation**: Offers tank-like movement for intuitive navigation, including speed adjustments and rotation without physical movement.
- **Dynamic Menu**: Provides an in-VR interface for selecting options, such as "Delete Measurements" to clear measurements.
- **Measurement Tools**: Enables real-time placement of points, lines, and areas, with measurements calculated automatically.
- **Custom Raycaster**: Cast rays for precise point placement with a visible red dot to mark placements.
- **Dynamic Labelling**: Displays labels for coordinates, lengths, and areas upon measurement to aid spatial awareness.

# Installation
Follow Potree’s installation instructions with the following setup:

- Install Node.js.
- Install Potree dependencies.
- Put the pointcloud in Potree format in the "pointclouds" folder.
- Create or adjust the html file in the "examples" folder to link to the pointcloud.
- Go to the examples page on a local server and press the "enter VR" button. 
Note: Due to an unsolved bug you must enter and exit the VR environment once before re-entering.

# VR Interactions and Controls
- **Movement**: When entering VR, first test the movement controls. With the left joystick (rotation) and the right one (translation), test both the speed and getting used to the movement inside the point cloud, in case the user wants to change the velocity. Once the movement is intuitive for the user, the other functionalities can be tested out.
- **Making Measurements**: With the inner buttons on the side of the controller, the user can either prompt a menu to pop-up (using the left inner button) or a ray to be casted (right inner button). The menu is not needed yet at this point. Therefore, start by casting a ray. By pressing and holding the inner right button, the user can cast a ray that will follow the right controller around in the scene. Therefore, allowing the user to place the ray anywhere in the point cloud. At the same time, the user can also adjust the length of the ray being caste by simply moving the rotation/left joystick up and down, changing the size of the ray (easily visualized by the red dot at the end of the line). Once the user finds the ray length optimal and is ready to place a point, simply press the big button at the front of the controller with the index finger. This will now place a button inside the scene with a label and its coordinates. If the user keeps holding the raycasting button, it can produce more points, resulting in lines and eventually in polygons of any desired shape and size. In order to obtain an accurate area result, we recommend following either a clockwise or anti-clockwise point positioning, instead of making polygons that contain random positioning and possible line intersections.
- **Deleting Measurements**: Now that the user already has its polygon and area made, they can choose to delete this measurement. To do so, just press the inner left button (menu button), to prompt the appearance of a menu interface. In order to delete the measurements, just point the left controller at the "Delete Measurements" notification button (inside the menu) and press the frontal button on the left controller. If aiming correctly at the button, the measurements will be deleted and the user can restart again with any new points, lines or areas. Close the menu label by pressing again the left inner button (menu button). This time, there is no need to hold down the menu button for the button to stay in the scene, a simple button trigger makes it appear and disappear.
Note: The measurments do not interact with the point cloud in any way. The points are added to the scene. 
![vr_controller_help1](https://github.com/user-attachments/assets/213e6634-7f2b-4ea5-9707-ea4cfb9b88c7)

# New Implementations
This project builds upon Potree’s source code, modifying VRControls.js to include the following main new functions:

- **computeRotation**: Allows rotation via joystick, enhancing control without physical movement.
- **updateRay**: Projects a ray from the controller for point placement, with adjustable length.
- **calculateDistance and calculateArea**: Computes measurements directly within VR.
- **createLabel**: Enhances spatial awareness by coloring polygons and adding labels.
- **createMenu**: Generates a 3D menu interface for easy interaction.


# Future Work
Future enhancements could include:

- **Dynamic Height**
- **Object Collision**
- **Buttons**
- **Point Cloud Interaction**

# Limitations
- The current setup may have VR stability and performance issues after extended use.
- Full point-cloud interaction, such as collision detection and dynamic height adjustments, are not included.
- The controls may switch controller when re-entering VR.
- When first entering VR, you will not be placed at the correct height. You must exit and re-enter the first time. 

# Acknowledgements
This project was developed for the Geomatics Synthesis Project at TU Delft in collaboration with GeoDelta. Special thanks to our supervisors and mentors for their guidance.


# Credits
This project is based on [Potree](http://potree.org) by Markus Schütz. Significant modifications have been made to enhance VR functionalities,

Additional sources from Potree:
* The multi-res-octree algorithms used by this viewer were developed at the Vienna University of Technology by Michael Wimmer and Claus Scheiblauer as part of the [Scanopy Project](http://www.cg.tuwien.ac.at/research/projects/Scanopy/).
* [Three.js](https://github.com/mrdoob/three.js), the WebGL 3D rendering library on which potree is built.
* [plas.io](http://plas.io/) point cloud viewer. LAS and LAZ support have been taken from the laslaz.js implementation of plas.io. Thanks to [Uday Verma](https://twitter.com/udaykverma) and [Howard Butler](https://twitter.com/howardbutler) for this!
* [Harvest4D](https://harvest4d.org/) Potree currently runs as Master Thesis under the Harvest4D Project
* Christian Boucheny (EDL developer) and Daniel Girardeau-Montaut ([CloudCompare](http://www.danielgm.net/cc/)). The EDL shader was adapted from the CloudCompare source code!
* [Martin Isenburg](http://rapidlasso.com/), [Georepublic](http://georepublic.de/en/),
[Veesus](http://veesus.com/), [Sigeom Sa](http://www.sigeom.ch/), [SITN](http://www.ne.ch/sitn), [LBI ArchPro](http://archpro.lbg.ac.at/),  [Pix4D](http://pix4d.com/) as well as all the contributers to potree and PotreeConverter and many more for their support.



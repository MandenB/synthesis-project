# VR Enhancements for Potree: Interactive Point Cloud Navigation and Measurement Tools
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
- **Movement**: Use the left joystick to rotate and the right joystick to move forward/backward. Adjust movement speed as needed for comfort.
- **Raycasting for Measurements**: Cast a ray by holding the right controller's button. Adjust the ray length using the left joystick (up/down). Press the controller's main button to place points, forming lines and polygons.
- **Deleting Measurements**: Open the menu by pressing the left controller’s inner button, then select "Delete Measurements" to clear placed elements.
Tip: To measure areas accurately, place points in a clockwise or counter-clockwise order.

# New Implementations
This project builds upon Potree’s source code, modifying VRControls.js to include the following main new functions:

- **computeRotation**: Allows rotation via joystick, enhancing control without physical movement.
- **updateRay**: Projects a ray from the controller for point placement, with adjustable length.
- **calculateDistance and calculateArea**: Computes measurements directly within VR.
- **createLabel**: Enhances spatial awareness by coloring polygons and adding labels.
- **createMenu**: Generates a 3D menu interface for easy interaction.

# Future Work
Future enhancements could include:

- **Dynamic Height**: Keeps users at a human-eye level above the ground for natural navigation.
- **Object Collision**: Prevents users from walking through solid objects, improving realism.
- **Buttons**: The use of buttons for various functions, instead or in addition to the menu. 

# Limitations
The current setup may have VR stability and performance issues after extended use.
Full point-cloud interaction, such as collision detection and dynamic height adjustments, are still under development.

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



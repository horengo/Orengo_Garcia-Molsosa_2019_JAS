// JavaScript code to be implemented in Google Earth Engine(c) developed by H.A. Orengo
// to accompany the paper:

// Orengo, H.A. and Garcia-Molsosa, A. 2019. 'A brave new world for archaeological survey:
// automated machine learning-based potsherd detection using high-resolution drone imagery'
// Journal of Archaeological Science. https://doi.org/10.1016/j.jas.2019.105013

//                ------------- ooo -------------

// TO EXECUTE THE ALGORITHM PASTE THIS CODE INTO GOOGLE EARTH ENGINE CODE EDITOR AND PRESS 'Run'

//                ------------- ooo -------------

// For more information on how this code works and how to apply it refer to the text of the article.
// Suggestions and code improvements are welcome! Please, contact Hector A. Orengo at horengo@icac.cat

// NOTES, READ CAREFULLY!
// 1. Visualisation parameters for each layer can be adjusted in the Layers dialogue in the map
//    area of Google Earth Engine.
// 2. To apply these analyses to your own areas: 
//      1.  Upload your orthoimage (resampled, as EE does not allow subcentimetric resolution
//          images) using the Assets' upload image option and change the orthomosaic variable
//          address to fit your own data.
//      2.  Delete the 'sherd' and 'other' variables in the 'Machine learning' section and create 
//          two new polygon feature collections with the same names using the polygon drawing tool
//          in the top left map area. Remember to: a) make sure the new polygon layers are feature
//          collections; b) add property called 'class' with a value of one for the 'sherd' layer
//          and a value of 0 for the 'other' layer; c) draw polygons marking training data for the
//          type of material culture you are interested in and any other type of pixel present
//          (vegetation, bare soil, stones, and so on). After obtaining the results of the classi-
//          fication use these results to select more training polygons to improve the results in
//          a new iteration of the algorithm.
// 3. The images resulting from this script can be transferred to your Google Drive running the
//    analysis from the 'Tasks' tab on the top right of the screen and selecting the Drive option.
// 4. No outputs of kernel-based results have been included in the map layer as EE executes these
//    using the screen resolution. To obtain the raster resulting from the morphologic filter and
//    its vectorisation run the analysis on the 'Tasks' tab. This sends the analysis to run on the
//    server at full resolution.
// 5. Specific instructions of how the algorithm works have been included within the code, please,
//    read these carefully and consult the paper's text to understand how to best apply it.

//                ------------- ooo -------------


// Define a central point in your study area (as X,Y WGS84 decimal degrees) and a scale,
// just for visualisation purposes. Change the coordinates to center the map in your own area
Map.setCenter(24.94657, 40.93488, 15);

// Indicate here iteration number and comments for naming the results
var iteration = 'it03published';

// Import the high-resolution orthophotomosaic from the asset repository
var orthomosaic = ee.Image('users/hao23/sherds/plot591'); // To use your own orthomosaic change the address to that of your asset
print('Orthomosaic', orthomosaic);
Map.addLayer(orthomosaic, {min: 0, max:255}, 'Plot 591');

// Extract the raster resolution for later export. Please, take into account that raster resolution
// here has been modified as the original resolution was subcentimetric and could not be ingested
// by Earth Engine.
var rr = orthomosaic.projection().nominalScale().getInfo();


//      ----0000 Gradient analysis 0000----

// Compute the image gradient in the X and Y directions
var xyGrad = orthomosaic.gradient();

// Compute the magnitude of the gradient.
var gradient = xyGrad.select('x').pow(2)
          .add(xyGrad.select('y').pow(2)).sqrt();

// Print gradient information in the console
print('Gradient magnitude', gradient);


//      ----0000 Composite 0000----

// Create a composite joining the orthomosaic RGB bands and the magnitude gradient
var composite = ee.Image ([orthomosaic,gradient]);

// Print the composite information in the console.
print('Composite', composite);


//      ----0000 Machine learning process 0000----

// Polygons employed to select the training data. Please, take into account that the third iteration 
// includes those created during the first and second iterations
var sherd = ee.FeatureCollection("users/hao23/sherds/potsherds_plot591_it3"),
    other = ee.FeatureCollection("users/hao23/sherds/other_plot591_it3");

// Merge the two polygon layer in a single training polygon layer
var train_pols = sherd.merge(other);

// Print the training polygons information information in the console
print('Training Polygons', train_pols);

// Select the bands of the composite to be employed during the process. This is hardly necessary in
// this case as all bands will be used, but it can be useful when testing the performance of different
// multiband composites
var bands = ['b1','b2','b3','x'];

// Sample the pixels defined by the polygons
var training = composite.select(bands).sampleRegions({
  collection: train_pols,
  properties: ['class']
});

// Train the Random Forest classifier in probability mode using the training data defined above
var classifier = ee.Classifier.smileRandomForest({'numberOfTrees':128})
  .setOutputMode('PROBABILITY').train({
  features: training,
  classProperty: 'class',
  inputProperties: bands
});

// Classify the composite image using the classifier created above
var classified = composite.select(bands).classify(classifier);

// Add the results of the classification to the map
Map.addLayer(classified.mask(classified), {min: 0.5, max: 1, palette: "ffffff,feffb4,fff505,ffaf00,ff0000,a10000,000000", opacity: 0.6}, 'iteration' + iteration);


//      ----0000 Filter of small false positives 0000----

// Morphology filtering values
var gt = 0.7; // fitting percentage of the Random Forest algorithm for pottery
var r1 = 1; // radius of the erosion
var r2 = 2; // radius of the dilation
var it1 = 1; // number of iterations of the erosion
var it2 = 2; // number of iterations of the dilation

// Threshold of the percentage of the RF classification
var threshold = classified.select('classification').gt(gt);

// Morphology filter
var filtered = threshold
             .focal_min({iterations: it1, kernel: ee.Kernel.square({radius: r1, units: 'pixels'})})
             .focal_max({iterations: it2, kernel: ee.Kernel.square({radius: r2, units: 'pixels'})});


//      ----0000 Vectorisation of the filtered raster 0000----

var vectors = filtered.mask(filtered).reduceToVectors({geometryType: 'polygon', maxPixels: 9e12});


//      ----0000 Outputs 0000----

Export.image.toAsset({
  image: classified,
  description: 'RF100_probability_sherds_plot591_' + iteration,
  scale: rr,
  maxPixels: 9e12,
  region: orthomosaic
});

Export.image.toAsset({
  image: filtered,
  description: 'filter_classif_' + iteration + '_sherds_plot591_gt' + gt*100 + '_r'+ r1 + '-' + r2 + '_it' + it1 + '-' + it2,
  scale: rr,
  maxPixels: 1e12,
  region: orthomosaic
});

Export.table.toAsset({
  collection: vectors,
  description:'vectors_filter_classif_' + iteration + '_sherds_plot591_gt' + gt*100 + '_r'+ r1 + '-' + r2 + '_it' + it1 + '-' + it2,
});

/* Standalone fixture, outside the CEP call stack. Run only against an empty project. */
(function () {
    if (!app.project) app.newProject();
    if (app.project.numItems !== 0) throw new Error('Le projet doit être vide pour créer cette démonstration.');
    var root = new File($.fileName).parent.parent;
    var output = new File(root.fsName + '/artifacts/lazy-motion-demo.aep');
    if (output.exists) throw new Error('Le fichier de démonstration existe déjà ; aucun fichier n’a été remplacé.');
    var comp, layer, i;
    var colors = [[1, 0.29, 0.11], [0.96, 0.96, 0.94], [0.39, 0.39, 0.37]];
    app.beginUndoGroup('Lazy Motion — composition de démonstration');
    try {
        comp = app.project.items.addComp('Lazy Motion — TEST 25 fps', 1280, 720, 1, 10, 25);
        for (i = 0; i < 3; i++) {
            layer = comp.layers.addSolid(colors[i], 'Test ' + (i + 1), 240, 160, 1, 10);
            layer.inPoint = i * 0.4;
            layer.outPoint = layer.inPoint + i + 1;
            layer.property('ADBE Transform Group').property('ADBE Position').setValue([320 + 320 * i, 360]);
        }
        comp.openInViewer();
        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = true;
    } finally { app.endUndoGroup(); }
    app.project.save(output);
}());

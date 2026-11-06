/* Run only through File > Scripts in the disposable demo project. Not shipped. */
(function () {
    var root = File($.fileName).parent.parent;
    var expected = File(root.fsName + '/artifacts/lazy-motion-demo.aep');
    var verified = File(root.fsName + '/artifacts/lazy-motion-v0.1.0-tests.aep');
    if (!app.project || !app.project.file || (app.project.file.fsName !== expected.fsName && app.project.file.fsName !== verified.fsName)) {
        alert('Vérification arrêtée : ouvre uniquement lazy-motion-demo.aep.'); return;
    }
    var report = [], comp, layers = [], i, x, y, result, anchor, position, before, after, parent, testLayer;
    function near(a,b) { if (Math.abs(a-b)>0.00001) throw new Error(a + ' != ' + b); }
    // AE's spatial Bezier interpolation is evaluated in floating point. Subpixel tolerance.
    function nearPixel(a,b) { if (Math.abs(a-b)>0.01) throw new Error(a + ' != ' + b); }
    function call(command,args) {
        var data = eval('(' + LazyMotion.dispatch(command,args) + ')');
        if (!data.ok) throw new Error(data.error);
        return data.data;
    }
    function test(name,fn) { try { fn(); report.push('PASS - ' + name); } catch(e) { report.push('FAIL - ' + name + ': ' + e.toString()); } }
    function selectAll() { for(var n=1;n<=comp.numLayers;n++)comp.layer(n).selected=true; }
    function selectOne(item) { for(var n=1;n<=comp.numLayers;n++)comp.layer(n).selected=false;item.selected=true; }
    try {
        $.evalFile(File(root.fsName + '/host/main.jsx'));
        comp = app.project.items.addComp('Lazy Motion - Verification 25 fps',1280,720,1,20,25);
        for(i=0;i<3;i++) { layers.push(comp.layers.addSolid([1,.29,.11],'Verification '+(i+1),240,160,1,20));layers[i].outPoint=(i+1); }
        comp.openInViewer(); selectAll();
        test('Cascade 25 fps / durées et raccords exacts',function(){
            call('cascade',{order:'forward'});
            near(comp.layer(2).inPoint,comp.layer(1).outPoint);near(comp.layer(3).inPoint,comp.layer(2).outPoint);
            near(comp.layer(1).outPoint-comp.layer(1).inPoint,3);near(comp.layer(2).outPoint-comp.layer(2).inPoint,2);near(comp.layer(3).outPoint-comp.layer(3).inPoint,1);
        });
        test('Durée 50 images sans étirement',function(){
            call('duration',{value:50,unit:'frames'});
            for(var n=1;n<=3;n++){near(comp.layer(n).outPoint-comp.layer(n).inPoint,2);near(comp.layer(n).stretch,100);}
        });
        test('Cascade inverse',function(){
            call('cascade',{order:'reverse'});near(comp.layer(2).inPoint,comp.layer(3).outPoint);near(comp.layer(1).inPoint,comp.layer(2).outPoint);
        });
        test('Calque verrouillé / aucune écriture partielle',function(){
            var old=comp.layer(1).outPoint;comp.layer(2).locked=true;
            var r=eval('('+LazyMotion.dispatch('duration',{value:25,unit:'frames'})+')');
            if(r.ok)throw new Error('Le verrouillage aurait dû bloquer la commande');near(comp.layer(1).outPoint,old);comp.layer(2).locked=false;
        });
        testLayer=comp.layer(1);selectOne(testLayer);comp.time=testLayer.inPoint;
        anchor=testLayer.property('ADBE Transform Group').property('ADBE Anchor Point');
        position=testLayer.property('ADBE Transform Group').property('ADBE Position');
        test('Neuf ancrages / position visuelle préservée',function(){
            before=testLayer.sourcePointToComp([0,0]);
            for(y=0;y<=1;y+=.5)for(x=0;x<=1;x+=.5){
                call('anchor',{x:x,y:y});near(anchor.value[0],240*x);near(anchor.value[1],160*y);
                after=testLayer.sourcePointToComp([0,0]);near(before[0],after[0]);near(before[1],after[1]);
            }
        });
        test('Rotation et échelle non uniforme / position préservée',function(){
            testLayer.property('ADBE Transform Group').property('ADBE Scale').setValue([-140,65]);
            testLayer.property('ADBE Transform Group').property('ADBE Rotate Z').setValue(37);
            before=testLayer.sourcePointToComp([0,0]);call('anchor',{x:0,y:0});after=testLayer.sourcePointToComp([0,0]);near(before[0],after[0]);near(before[1],after[1]);
        });
        test('Position animée / trajectoire visuelle préservée',function(){
            position.setValueAtTime(0,[400,300]);position.setValueAtTime(2,[600,400]);
            comp.time=1;before=testLayer.sourcePointToComp([0,0]);call('anchor',{x:1,y:1});after=testLayer.sourcePointToComp([0,0]);nearPixel(before[0],after[0]);nearPixel(before[1],after[1]);
        });
        test('Dimensions de position séparées',function(){
            position.dimensionsSeparated=true;before=testLayer.sourcePointToComp([0,0]);call('anchor',{x:.5,y:.5});after=testLayer.sourcePointToComp([0,0]);near(before[0],after[0]);near(before[1],after[1]);
        });
        test('Ancrage 3D refusé sans déplacement',function(){
            testLayer.threeDLayer=true;var old=anchor.value;
            var r=eval('('+LazyMotion.dispatch('anchor',{x:0,y:0})+')');if(r.ok)throw new Error('Le calque 3D aurait dû être refusé');near(anchor.value[0],old[0]);testLayer.threeDLayer=false;
        });
        test('Secondes à 29,97 i/s / arrondi à 30 images',function(){
            var fractional=app.project.items.addComp('Lazy Motion - Verification 29.97 fps',1280,720,1,10,30000/1001);
            var solid=fractional.layers.addSolid([1,.29,.11],'29.97 fps',240,160,1,10);
            fractional.openInViewer();solid.selected=true;var r=call('duration',{value:1,unit:'seconds'});near(r.frames,30);near(solid.outPoint-solid.inPoint,30*fractional.frameDuration);
        });
        comp.openInViewer();selectAll();
        comp.comment=report.join('\n');
        app.project.save(File(root.fsName+'/artifacts/lazy-motion-v0.1.0-tests.aep'));
    } catch(error) { report.push('FAIL - préparation: '+error.toString()); }
    try { var out=File(root.fsName+'/artifacts/native-verification.txt');out.encoding='UTF-8';if(out.open('w')){out.write(report.join('\n'));out.close();} }catch(writeError){}
    alert('Lazy Motion 0.1.0 - Vérification native\n\n'+report.join('\n'));
}());

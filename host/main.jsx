/* Lazy Motion / ExtendScript ES3. Validate the entire selection before writing. */
var LazyMotion = (function () {
    function quote(value) {
        return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/[\x00-\x1f]/g, function (c) {
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    function json(value) {
        var parts = [], key, i;
        if (value === null || typeof value === 'undefined') return 'null';
        if (typeof value === 'string') return quote(value);
        if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
        if (typeof value === 'boolean') return String(value);
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) parts.push(json(value[i]));
            return '[' + parts.join(',') + ']';
        }
        for (key in value) if (value.hasOwnProperty(key)) parts.push(quote(key) + ':' + json(value[key]));
        return '{' + parts.join(',') + '}';
    }
    function selection() {
        var comp = app.project ? app.project.activeItem : null;
        var result = { host: app.version, comp: null, layers: [] }, layers, i, layer;
        if (!(comp instanceof CompItem)) return result;
        result.comp = { name: comp.name, frameRate: comp.frameRate, frameDuration: comp.frameDuration, duration: comp.duration };
        layers = comp.selectedLayers;
        for (i = 0; i < layers.length; i++) {
            layer = layers[i];
            result.layers.push({ index: layer.index, name: layer.name, inPoint: layer.inPoint,
                outPoint: layer.outPoint, durationFrames: Math.round((layer.outPoint - layer.inPoint) / comp.frameDuration),
                locked: layer.locked, threeD: layer.threeDLayer === true });
        }
        result.layers.sort(function (a, b) { return a.index - b.index; });
        return result;
    }
    function selected(minimum) {
        var comp = app.project ? app.project.activeItem : null, layers = [], i;
        if (!(comp instanceof CompItem)) throw new Error('Ouvre une composition et sélectionne ses calques dans la timeline.');
        for (i = 0; i < comp.selectedLayers.length; i++) layers.push(comp.selectedLayers[i]);
        if (layers.length < minimum) throw new Error('Sélectionne au moins ' + minimum + (minimum === 1 ? ' calque.' : ' calques.'));
        layers.sort(function (a, b) { return a.index - b.index; });
        for (i = 0; i < layers.length; i++) if (layers[i].locked) throw new Error('Déverrouille le calque « ' + layers[i].name + ' » puis réessaie.');
        return { comp: comp, layers: layers };
    }
    function withinComp(comp, time) {
        if (time > comp.duration + comp.frameDuration * 0.0001) throw new Error('Le résultat dépasserait la fin de la composition. Allonge la composition puis réessaie.');
    }
    function commit(name, operations) {
        var i, last = -1, restored = true;
        app.beginUndoGroup('Lazy Motion · ' + name);
        try {
            for (i = 0; i < operations.length; i++) { last = i; operations[i].apply(); }
        } catch (error) {
            for (i = last; i >= 0; i--) { try { operations[i].restore(); } catch (restoreError) { restored = false; } }
            throw new Error(String(error) + (restored ? ' Les valeurs précédentes ont été rétablies.' : ' Utilise Ctrl + Z pour rétablir la sélection.'));
        } finally { app.endUndoGroup(); }
    }
    function cascade(args) {
        var current = selected(2), comp = current.comp, layers = current.layers, cursor, i, layer, delta, plans = [], operations = [];
        if (args.order !== 'forward' && args.order !== 'reverse') throw new Error('Ordre de cascade invalide.');
        if (args.order === 'reverse') layers.reverse();
        cursor = layers[0].inPoint;
        for (i = 0; i < layers.length; i++) {
            layer = layers[i];
            if (!(layer.outPoint > layer.inPoint)) throw new Error('Durée invalide pour « ' + layer.name + ' ».');
            delta = cursor - layer.inPoint;
            if (Math.abs(layer.startTime + delta) > 10800) throw new Error('La cascade dépasserait la limite temporelle d’After Effects.');
            plans.push({ layer: layer, before: layer.startTime, after: layer.startTime + delta });
            cursor += layer.outPoint - layer.inPoint;
        }
        withinComp(comp, cursor);
        for (i = 0; i < plans.length; i++) (function (p) {
            operations.push({ apply: function () { p.layer.startTime = p.after; }, restore: function () { p.layer.startTime = p.before; } });
        })(plans[i]);
        commit('Cascade', operations);
        return { selection: selection(), message: layers.length + ' calques mis bout à bout.' };
    }
    function duration(args) {
        var current = selected(1), comp = current.comp, layers = current.layers, value = args.value, frames, seconds, i, layer, end, sourceStart, sourceEnd, plans = [], operations = [];
        if (typeof value !== 'number' || !isFinite(value) || value <= 0) throw new Error('Saisis une durée positive.');
        if (args.unit !== 'frames' && args.unit !== 'seconds') throw new Error('Unité de durée invalide.');
        if (args.unit === 'frames' && value !== Math.round(value)) throw new Error('Le nombre d’images doit être entier.');
        frames = args.unit === 'frames' ? value : Math.round(value / comp.frameDuration);
        if (frames < 1) throw new Error('La durée doit représenter au moins une image.');
        seconds = frames * comp.frameDuration;
        for (i = 0; i < layers.length; i++) {
            layer = layers[i]; end = layer.inPoint + seconds;
            withinComp(comp, end);
            if (end > layer.outPoint + comp.frameDuration * 0.0001 && layer.source && !layer.timeRemapEnabled && !(layer.source.mainSource && layer.source.mainSource.isStill)) {
                sourceStart = (layer.inPoint - layer.startTime) * 100 / layer.stretch;
                sourceEnd = (end - layer.startTime) * 100 / layer.stretch;
                if (Math.min(sourceStart, sourceEnd) < -0.00001 || Math.max(sourceStart, sourceEnd) > layer.source.duration + 0.00001)
                    throw new Error('La source de « ' + layer.name + ' » est trop courte pour cette durée.');
            }
            plans.push({ layer: layer, before: layer.outPoint, after: end });
        }
        for (i = 0; i < plans.length; i++) (function (p) {
            operations.push({ apply: function () { p.layer.outPoint = p.after; }, restore: function () { p.layer.outPoint = p.before; } });
        })(plans[i]);
        commit('Durée commune', operations);
        return { selection: selection(), message: layers.length + (layers.length === 1 ? ' calque : ' : ' calques : ') + frames + ' images chacun.', frames: frames };
    }
    function snapshot(property) {
        var values = [], i;
        if (property.expressionEnabled) throw new Error('Désactive l’expression de position avant de déplacer l’ancrage.');
        for (i = 1; i <= property.numKeys; i++) values.push(property.keyValue(i));
        return { property: property, values: values, value: property.value };
    }
    function addValue(value, offset) {
        var result = [], i;
        if (typeof value === 'number') return value + offset;
        for (i = 0; i < value.length; i++) result.push(value[i] + (offset[i] || 0));
        return result;
    }
    function shifted(snap, offset, restore) {
        var i;
        if (snap.values.length) {
            for (i = 0; i < snap.values.length; i++) snap.property.setValueAtKey(i + 1, restore ? snap.values[i] : addValue(snap.values[i], offset));
        } else snap.property.setValue(restore ? snap.value : addValue(snap.value, offset));
    }
    function anchor(args) {
        var current = selected(1), comp = current.comp, layers = current.layers, i, j, layer, tr, ap, pos, scale, rotation, rect, oldAnchor, nextAnchor, dx, dy, radians, offset, positionSnaps, plans = [], operations = [];
        if (typeof args.x !== 'number' || typeof args.y !== 'number' || !isFinite(args.x) || !isFinite(args.y) || args.x < 0 || args.x > 1 || args.y < 0 || args.y > 1 || args.x * 2 !== Math.round(args.x * 2) || args.y * 2 !== Math.round(args.y * 2)) throw new Error('Point d’ancrage invalide.');
        for (i = 0; i < layers.length; i++) {
            layer = layers[i];
            if (layer.threeDLayer || layer.collapseTransformation) throw new Error('L’ancrage prend en charge les calques 2D sans réduction des transformations dans cette version.');
            if (typeof AutoOrientType !== 'undefined' && layer.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) throw new Error('Désactive l’orientation automatique pour « ' + layer.name + ' ».');
            tr = layer.property('ADBE Transform Group');
            ap = tr ? tr.property('ADBE Anchor Point') : null;
            pos = tr ? tr.property('ADBE Position') : null;
            scale = tr ? tr.property('ADBE Scale') : null;
            rotation = tr ? tr.property('ADBE Rotate Z') : null;
            if (!ap || !pos || !scale || !rotation || typeof layer.sourceRectAtTime !== 'function' || layer.hasVideo === false) throw new Error('Le calque « ' + layer.name + ' » n’a pas de contenu visuel compatible.');
            if (ap.isTimeVarying || scale.isTimeVarying || rotation.isTimeVarying) throw new Error('Pour « ' + layer.name + ' », règle l’ancrage avant d’animer l’ancrage, l’échelle ou la rotation. La position animée reste prise en charge.');
            rect = layer.sourceRectAtTime(comp.time, false);
            if (!(rect.width > 0 && rect.height > 0)) throw new Error('Le contenu de « ' + layer.name + ' » est vide à cet instant.');
            oldAnchor = ap.value;
            nextAnchor = [rect.left + rect.width * args.x, rect.top + rect.height * args.y];
            dx = (nextAnchor[0] - oldAnchor[0]) * scale.value[0] / 100;
            dy = (nextAnchor[1] - oldAnchor[1]) * scale.value[1] / 100;
            radians = rotation.value * Math.PI / 180;
            offset = [dx * Math.cos(radians) - dy * Math.sin(radians), dx * Math.sin(radians) + dy * Math.cos(radians)];
            positionSnaps = [];
            if (pos.dimensionsSeparated) {
                for (j = 0; j < 2; j++) positionSnaps.push({ snap: snapshot(pos.getSeparationFollower(j)), offset: offset[j] });
            } else positionSnaps.push({ snap: snapshot(pos), offset: offset });
            plans.push({ anchor: snapshot(ap), nextAnchor: nextAnchor, positions: positionSnaps });
        }
        for (i = 0; i < plans.length; i++) (function (p) {
            operations.push({ apply: function () {
                var k; p.anchor.property.setValue(p.nextAnchor);
                for (k = 0; k < p.positions.length; k++) shifted(p.positions[k].snap, p.positions[k].offset, false);
            }, restore: function () {
                var k; p.anchor.property.setValue(p.anchor.value);
                for (k = 0; k < p.positions.length; k++) shifted(p.positions[k].snap, p.positions[k].offset, true);
            } });
        })(plans[i]);
        commit('Point d’ancrage', operations);
        return { selection: selection(), message: 'Ancrage appliqué à ' + layers.length + (layers.length === 1 ? ' calque.' : ' calques.') };
    }
    return { dispatch: function (command, args) {
        try {
            if (command === 'selection') return json({ ok: true, data: selection() });
            if (command === 'cascade') return json({ ok: true, data: cascade(args || {}) });
            if (command === 'duration') return json({ ok: true, data: duration(args || {}) });
            if (command === 'anchor') return json({ ok: true, data: anchor(args || {}) });
            throw new Error('Commande inconnue');
        } catch (error) { return json({ ok: false, error: error.message || String(error) }); }
    }};
}());

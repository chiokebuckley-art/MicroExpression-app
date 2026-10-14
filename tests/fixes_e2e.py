"""Regression checks and visual evidence for the Desktop codex-handoff."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json
import base64
import math

IDENTITIES = ['riya','female_adult_08','female_adult_12','male_adult_01','male_adult_06']
EMOTIONS = ['happiness','sadness','anger','fear','surprise','disgust','contempt']

def diff(a, b, box=None):
    a, b = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if box: a,b = a.crop(box), b.crop(box)
    return sum(ImageStat.Stat(ImageChops.difference(a,b)).mean) / 3

def settle(page):
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')

def run_updates(page, context, base_url, root):
    root = Path(root)
    shots = root / 'screenshots/fixes'
    for folder in ['camera','expressions','loading','journey']:
        (shots / folder).mkdir(parents=True,exist_ok=True)
    lesson = root / 'screenshots/lesson';lesson.mkdir(parents=True,exist_ok=True)
    canvas = page.locator('#rigCanvasMount')
    print('3a. Checking per-identity cameras, expression regions, and load races...', flush=True)
    metrics = {}
    for rig in IDENTITIES:
        page.evaluate('(id)=>window.__rig.loadRig(id)',rig)
        page.evaluate('window.__rig.idleBlinksEnabled=false;window.__rig.resetToNeutral()')
        for width,height in [(1280,800),(390,844)]:
            page.set_viewport_size({'width':width,'height':height});settle(page)
            for preset in ['front','left34','right34','eyeCloseup','mouthCloseup']:
                page.evaluate('(p)=>window.__rig.setCameraPreset(p)',preset);settle(page)
                points = page.evaluate("Object.fromEntries(['brow','eyeL','eyeR','mouth','chin','cornerL','cornerR'].map(k=>[k,window.__rig.projectLandmark(k)]))")
                if preset in ['front','left34','right34']:
                    for name in ['brow','eyeL','eyeR','mouth','chin']:
                        assert abs(points[name]['x']) <= .92 and abs(points[name]['y']) <= .92, (rig,preset,width,name,points[name])
                elif preset == 'eyeCloseup':
                    assert all(abs(points[k]['y']) <= .92 and abs(points[k]['x']) <= .92 for k in ['brow','eyeL','eyeR']), (rig,preset,points)
                    assert points['mouth']['y'] < -.55, (rig,preset,points)
                else:
                    assert all(abs(points[k]['y']) <= .92 and abs(points[k]['x']) <= .92 for k in ['cornerL','cornerR','chin']), (rig,preset,points)
                    assert points['eyeL']['y'] > .55, (rig,preset,points)
                suffix = '' if width == 1280 else '_phone'
                canvas.screenshot(path=str(shots/'camera'/f'{rig}_{preset}{suffix}.png'))
        page.set_viewport_size({'width':1280,'height':800})
        page.evaluate("window.__rig.setCameraPreset('front')");settle(page)
        projections = page.evaluate("Object.fromEntries(['eyeL','eyeR','brow','mouth','cornerL','cornerR'].map(k=>[k,window.__rig.projectLandmark(k)]))")
        box = canvas.bounding_box();w,h=box['width'],box['height']
        def px(k):return ((projections[k]['x']+1)*w/2,(1-projections[k]['y'])*h/2)
        eyeL,eyeR,brow,mouth = px('eyeL'),px('eyeR'),px('brow'),px('mouth')
        face_pixels = abs(mouth[1]-brow[1])*1.8
        eye_box = (int(min(eyeL[0],eyeR[0])-.23*face_pixels),int(min(eyeL[1],eyeR[1])-.14*face_pixels),int(max(eyeL[0],eyeR[0])+.23*face_pixels),int(max(eyeL[1],eyeR[1])+.15*face_pixels))
        brow_box=(eye_box[0],int(brow[1]-.18*face_pixels),eye_box[2],int(brow[1]+.08*face_pixels))
        paths={}
        for emotion in ['neutral',*EMOTIONS,'happiness_social']:
            page.evaluate('(id)=>window.__rig.setExpressionFromRecipe(window.__content.expressions.recipes.find(e=>e.id===id))', emotion)
            settle(page)
            paths[emotion]=shots/'expressions'/f'{rig}_{emotion}.png'
            canvas.screenshot(path=str(paths[emotion]))
        metrics[rig]={'happiness_eye':diff(paths['neutral'],paths['happiness'],eye_box),'smile_eye_contrast':diff(paths['happiness'],paths['happiness_social'],eye_box)}
        # Compare the same anatomical eye patch with immutable pre-fix captures.
        baseline = shots/'before'/'features.json'
        if baseline.exists():
            feature = max(json.loads(baseline.read_text())[rig], key=lambda m:m['n'])['features']
            old_eyes=[feature['eyeWideLeft'],feature['eyeWideRight']]
            old_mouth=[feature['mouthSmileLeft'],feature['mouthSmileRight']]
            physical_height=(feature['browInnerUp'][1]-sum(p[1] for p in old_mouth)/2)*1.8
            def old_px(p):
                x,y,z=p;y-=1.595;z-=.5;depth=-y*.019996-z*.9998
                tan=math.tan(math.radians(17.5))
                return ((1+x/(depth*tan)*(460/440))*220,(1-(y*.9998-z*.019996)/(depth*tan))*230)
            a,b=[old_px(p) for p in old_eyes];size=physical_height/(.45*math.tan(math.radians(17.5)))*230
            old_box=(int(min(a[0],b[0])-.23*size),int(min(a[1],b[1])-.14*size),int(max(a[0],b[0])+.23*size),int(max(a[1],b[1])+.15*size))
            old_diff=diff(shots/'before'/f'{rig}_neutral.png',shots/'before'/f'{rig}_happiness.png',old_box)
            metrics[rig]['happiness_eye_before']=old_diff
            metrics[rig]['happiness_eye_gain']=metrics[rig]['happiness_eye']/max(.001,old_diff)
            assert metrics[rig]['happiness_eye_gain'] >= 2, (rig,metrics[rig])
        assert metrics[rig]['smile_eye_contrast'] > 1.5, metrics[rig]
        for emotion in ['sadness','fear','surprise','anger']:
            metrics[rig][f'{emotion}_brow']=diff(paths['neutral'],paths[emotion],brow_box)
            assert metrics[rig][f'{emotion}_brow'] > 1, (rig,emotion,metrics[rig])
        # Match head pose before checking contempt; a head tilt isn't an AU.
        page.evaluate("window.__rig.setExpressionFromRecipe({aus:[],extras:{headPitch:2}})");settle(page)
        pose_neutral=shots/'expressions'/f'{rig}_pose-neutral.png';canvas.screenshot(path=str(pose_neutral))
        metrics[rig]['contempt_upper']=diff(pose_neutral,paths['contempt'],brow_box)
        assert metrics[rig]['contempt_upper'] < 1.0, (rig,metrics[rig])
        left,right=px('cornerL'),px('cornerR')
        corner_boxes=[(int(x-.08*face_pixels),int(y-.07*face_pixels),int(x+.08*face_pixels),int(y+.07*face_pixels))for x,y in [left,right]]
        corner_diffs=[diff(pose_neutral,paths['contempt'],b)for b in corner_boxes]
        metrics[rig]['contempt_corner_asymmetry']=abs(corner_diffs[0]-corner_diffs[1])
        assert metrics[rig]['contempt_corner_asymmetry'] > .5, (rig,corner_diffs)
    (shots/'region-metrics.json').write_text(json.dumps(metrics,indent=2))
    page.evaluate("()=>Promise.all([window.__rig.loadRig('male_adult_01'),window.__rig.loadRig('female_adult_08')])")
    assert page.evaluate("window.__rig.currentRigId === 'female_adult_08' && window.__rig.headOffsetGroup.children.filter(x=>x!==window.__rig.hotspotGroup).length===1")
    assert page.locator('#rigIdentitySelect').input_value() == 'female_adult_08'

    print('3b. Checking the lesson, annotations, fallback, preview and baseline skip...',flush=True)
    page.evaluate("async()=>{const db=await import('./src/store/db.js');const {blankJourney}=await import('./src/train/journey.js?v=6');await db.putRecord('progress',blankJourney());location.hash='#/stage/1';}")
    page.locator('#lookForSlider').wait_for()
    assert page.locator('.lesson-card').get_attribute('data-card') == 'happiness'
    for index,emotion in enumerate(['happiness','sadness','anger','fear','surprise','disgust','contempt']):
        assert page.locator('.lesson-card').get_attribute('data-card') == emotion
        for value in [0,50,100]:
            page.locator('#lookForSlider').fill(str(value));settle(page)
            assert page.locator('#lookForSlider').get_attribute('aria-valuetext').startswith(f'{value}%')
            errors = page.evaluate("""()=>[...document.querySelectorAll('.lesson-annot g')].map(g=>{
              const p=window.__rig.projectLandmark(g.dataset.anchor),c=g.querySelector('circle'),r=window.__rig.canvas.getBoundingClientRect();
              return Math.hypot(Number(c.getAttribute('cx'))-(p.x+1)*r.width/2, Number(c.getAttribute('cy'))-(1-p.y)*r.height/2);
            })""")
            assert errors and max(errors) < 1, (emotion,value,errors)
            if value in [0,100]:page.screenshot(path=str(lesson/f'{emotion}_{value}.png'),full_page=True)
        page.locator('#lessonCompare').click();assert page.locator('#lessonCompare').inner_text().startswith('Return to')
        page.locator('#lessonCompare').click()
        page.locator('[data-lesson-au]').first.click();assert page.locator('[data-lesson-au]').first.get_attribute('aria-pressed')=='true'
        if index<6:page.locator('#lessonNext').click()
    page.locator('#lessonNext').click();page.get_by_role('button',name='Skip for now',exact=True).wait_for()
    page.get_by_role('button',name='Skip for now',exact=True).click();page.get_by_role('button',name='Check all seven',exact=True).wait_for()
    page.goto(base_url+'/#/home');page.locator('.baseline-banner').wait_for();page.screenshot(path=str(shots/'journey'/'baseline-skipped.png'))
    page.goto(base_url+'/#/stage/2');page.get_by_role('button',name='Preview this stage',exact=True).wait_for();page.get_by_role('button',name='Preview this stage',exact=True).click()
    page.locator('.preview-badge').wait_for();page.screenshot(path=str(shots/'journey'/'stage2-preview.png'))
    page.goto(base_url+'/#/finish');page.get_by_text('A baseline is needed',exact=False).wait_for()
    page.goto(base_url+'/?nowebgl=1#/lesson/look-for');page.locator('.lesson-reference img').wait_for()
    for i in range(7):
        assert page.locator('.lesson-reference').is_visible()
        page.wait_for_function("document.querySelector('.lesson-reference img').naturalWidth===1600")
        if i<6:page.locator('#lessonNext').click()
    page.screenshot(path=str(lesson/'fallback.png'),full_page=True)

    print('3c. Checking ten rotating trials, readiness and countdown pixels...',flush=True)
    page.goto(base_url+'/#/assessment');page.get_by_role('button',name='Start baseline',exact=True).wait_for()
    page.evaluate("window.__rig.setCameraPreset('mouthCloseup')")
    user_identity=page.evaluate('window.__rig.currentRigId')
    page.get_by_role('button',name='Start baseline',exact=True).click()
    page.wait_for_function('window.__app.activeViewInstance.run?.assessment')
    assert page.locator('#rigIdentitySelect').is_disabled()
    assert 'set by test' in page.locator('#rigIdentityReason').inner_text()
    # Throttle the actual GLB requests on a cold identity cache; keep app requests local.
    context.new_cdp_session(page).send('Network.emulateNetworkConditions',{'offline':False,'latency':80,'downloadThroughput':2*1024*1024,'uploadThroughput':1024*1024})
    page.evaluate("""()=>{
      const r=window.__rig,original=r.scheduler.scheduleFlash.bind(r.scheduler);window.__readyChecks=[];
      r.scheduler.scheduleFlash=opts=>{window.__readyChecks.push(r.isReady);return original(opts);};
      window.__app.activeViewInstance.run.items=window.__app.activeViewInstance.run.items.slice(0,10);
      window.__tickShots=[];let previous='';
      window.__countdownObserver=new MutationObserver(()=>{
        const text=document.querySelector('.flash-cue')?.textContent || '';
        if (text===previous) return;previous=text;
        if (text==='Look at the face · 2' || text==='Get ready · 1') {
          window.__tickShots.push({text,data:r.canvas.toDataURL(),ready:r.isReady});
        }
      });window.__countdownObserver.observe(document.getElementById('rigCanvasMount'),{childList:true,subtree:true,characterData:true});
    }""")
    for i in range(10):
        page.get_by_role('button',name='Show (',exact=False).click()
        page.wait_for_function("document.querySelector('.flash-cue')?.textContent==='Look at the face · 2'",timeout=60000)
        assert page.locator('#rigIdentitySelect').input_value()==page.evaluate('window.__rig.currentRigId')
        assert page.evaluate("window.__rig.currentPreset === 'front'")
        page.wait_for_function("[...document.querySelectorAll('.answer')].every(b=>!b.disabled)",timeout=60000)
        tick_shots=page.evaluate('window.__tickShots.splice(0)')
        assert len(tick_shots)==2, (i,len(tick_shots))
        for tick in tick_shots:
            path=shots/'loading'/f'trial-{i+1}-{2 if "2" in tick["text"] else 1}.png'
            path.write_bytes(base64.b64decode(tick['data'].split(',')[1]))
            assert tick['ready']
            im=Image.open(path).convert('RGB');w,h=im.size
            assert max(ImageStat.Stat(im.crop((.3*w,.3*h,.7*w,.7*h))).stddev)>8,(i,tick['text'])
        answer=page.evaluate('window.__app.activeViewInstance.run.items[window.__app.activeViewInstance.run.index].answer')
        page.locator('.answer').filter(has_text=answer).first.click()
        page.get_by_role('button',name='Check',exact=True).click();page.get_by_role('button',name='Next',exact=True).click()
    page.get_by_role('heading',name='Check complete',exact=True).wait_for()
    page.evaluate('window.__countdownObserver.disconnect()')
    assert page.evaluate('window.__readyChecks.length===10 && window.__readyChecks.every(Boolean)')
    assert page.locator('#rigIdentitySelect').is_enabled()
    assert page.evaluate('window.__rig.currentRigId')==user_identity
    assert page.evaluate('window.__rig.currentPreset')=='mouthCloseup'
    context.new_cdp_session(page).send('Network.emulateNetworkConditions',{'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
    # A complete lesson remains reachable offline after its initial load.
    page.goto(base_url+'/#/lesson/look-for');page.locator('#lookForSlider').wait_for()
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    page.evaluate("async()=>{const r=await navigator.serviceWorker.ready;await r.active.postMessage('ready')}")
    context.set_offline(True)
    page.reload();page.locator('#lookForSlider').wait_for(timeout=60000)
    page.locator('#lessonReference').click();page.wait_for_function("document.querySelector('.lesson-reference img').naturalWidth===1600")
    context.set_offline(False)
    page.set_viewport_size({'width':390,'height':844});settle(page)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.locator('#lookForSlider').fill('100');settle(page)
    page.screenshot(path=str(lesson/'phone.png'),full_page=True)
    page.goto(base_url+'/#/settings');page.locator('#settingsBeginnerMinimum').wait_for();assert page.locator('#settingsBeginnerMinimum').is_checked()
    page.set_viewport_size({'width':611,'height':724})
    page.goto(base_url+'/#/lesson/look-for');page.locator('#lookForSlider').wait_for()
    page.locator('#lookForSlider').evaluate("e=>e.scrollIntoView({block:'end'})")
    face=canvas.bounding_box();slider=page.locator('#lookForSlider').bounding_box()
    assert face['height']==260 and face['y']+face['height']<slider['y']
    page.screenshot(path=str(lesson/'narrow-panel.png'))
    page.set_viewport_size({'width':1280,'height':800})
    # Restore the expected state for the original reference-library smoke tests.
    page.evaluate("async()=>{const db=await import('./src/store/db.js');await db.saveSetting('unlockAll',true);await db.saveSetting('ethicsCompleted',true);window.__app.settings.unlockAll=true;window.__app.settings.ethicsCompleted=true;}")

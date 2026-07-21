/**
 * Small dependency-free enhancement for the public SSR audio player.
 * The native <audio controls> remains visible if JavaScript is unavailable.
 */
export const PUBLISHED_STORY_AUDIO_ENHANCEMENT_SCRIPT = `(function(){
  var playerElements=Array.prototype.slice.call(document.querySelectorAll('[data-story-audio-player]'));
  if(!playerElements.length)return;

  var alignmentRequests={};
  var timedWords=null;
  var activeAudio=null;
  var activeWord=null;
  var activeScene=null;

  function formatTime(value){
    var seconds=Number.isFinite(value)&&value>0?value:0;
    var minutes=Math.floor(seconds/60);
    return minutes+':'+String(Math.floor(seconds%60)).padStart(2,'0');
  }

  function normalizedToken(value){
    return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu,'');
  }

  function loadAlignment(url){
    if(!url)return Promise.resolve(null);
    if(!alignmentRequests[url]){
      alignmentRequests[url]=fetch(url,{credentials:'same-origin'})
        .then(function(response){
          if(!response.ok)throw new Error('alignment_unavailable');
          return response.json();
        })
        .then(function(payload){return payload&&payload.alignment?payload.alignment:null;})
        .catch(function(){return null;});
    }
    return alignmentRequests[url];
  }

  function buildTimedText(alignment){
    if(timedWords)return timedWords;
    var sourceWords=alignment&&Array.isArray(alignment.words)?alignment.words:[];
    var words=sourceWords.map(function(item){
      var text=item&&typeof item.text==='string'?item.text:item&&typeof item.word==='string'?item.word:'';
      return {
        text:text,
        normalized:normalizedToken(text),
        start:Number(item&&item.start),
        end:Number(item&&item.end)
      };
    }).filter(function(item){
      return item.normalized&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>=item.start;
    });
    if(!words.length)return [];

    var cursor=0;
    var rendered=[];
    var scenes=Array.prototype.slice.call(document.querySelectorAll('.scene-text,.comic-bubble span'));
    scenes.forEach(function(sceneText){
      var bubble=sceneText.closest('.comic-bubble');
      var comicPage=bubble&&bubble.closest('.comic-page');
      var panelIndex=bubble&&bubble.getAttribute('data-panel-index');
      var panelTarget=comicPage&&panelIndex
        ?comicPage.querySelector('.comic-panel-scroll-target[data-panel-index="'+panelIndex+'"]')
        :null;
      var scrollTarget=panelTarget||sceneText.closest('.scene,.comic-page')||sceneText;
      var parts=String(sceneText.textContent||'').split(/(\\s+)/u);
      var fragment=document.createDocumentFragment();
      parts.forEach(function(part){
        var token=normalizedToken(part);
        if(!token){
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        var match=-1;
        var searchEnd=Math.min(words.length,cursor+12);
        for(var index=cursor;index<searchEnd;index+=1){
          if(words[index].normalized===token){match=index;break;}
        }
        if(match<0){
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        var timing=words[match];
        cursor=match+1;
        var span=document.createElement('span');
        span.className='story-audio-word';
        span.textContent=part;
        span.dataset.audioStart=String(timing.start);
        span.dataset.audioEnd=String(timing.end);
        fragment.appendChild(span);
        rendered.push({element:span,start:timing.start,end:timing.end,scene:scrollTarget});
      });
      sceneText.textContent='';
      sceneText.appendChild(fragment);
    });
    timedWords=rendered;
    return rendered;
  }

  function clearHighlight(){
    if(activeWord)activeWord.classList.remove('story-audio-word-active');
    activeWord=null;
    activeScene=null;
  }

  function highlightAt(position,followEnabled){
    if(!followEnabled)return;
    if(!timedWords||!timedWords.length){clearHighlight();return;}
    var low=0;
    var high=timedWords.length-1;
    var found=null;
    while(low<=high){
      var middle=(low+high)>>1;
      var candidate=timedWords[middle];
      if(position<candidate.start){high=middle-1;}
      else if(position>=candidate.end){low=middle+1;}
      else{found=candidate;break;}
    }
    if(!found){
      if(activeWord)activeWord.classList.remove('story-audio-word-active');
      activeWord=null;
      return;
    }
    if(activeWord!==found.element){
      if(activeWord)activeWord.classList.remove('story-audio-word-active');
      activeWord=found.element;
      activeWord.classList.add('story-audio-word-active');
    }
    if(activeScene!==found.scene){
      activeScene=found.scene;
      found.scene.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    }
  }

  playerElements.forEach(function(root){
    var audio=root.querySelector('.story-audio-native');
    var playButton=root.querySelector('[data-audio-play]');
    var progress=root.querySelector('[data-audio-progress]');
    var current=root.querySelector('[data-audio-current]');
    var duration=root.querySelector('[data-audio-duration]');
    var speed=root.querySelector('[data-audio-speed]');
    var speedValue=root.querySelector('[data-audio-speed-value]');
    var follow=root.querySelector('[data-audio-follow]');
    var status=root.querySelector('[data-audio-status]');
    var alignmentUrl=root.getAttribute('data-alignment-url')||'';
    var followEnabled=false;
    if(!audio||!playButton||!progress)return;

    root.dataset.enhanced='true';

    function setStatus(message,isError){
      if(!status)return;
      status.textContent=message||'';
      status.classList.toggle('story-audio-status-error',!!isError);
    }

    function syncPlayState(){
      var playing=!audio.paused&&!audio.ended;
      root.dataset.playing=playing?'true':'false';
      playButton.setAttribute('aria-pressed',playing?'true':'false');
      playButton.setAttribute('aria-label',playing?'Призупинити історію':'Відтворити історію');
    }

    function syncProgress(){
      var total=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Number(progress.max)||0;
      if(total>0){progress.max=String(total);if(duration)duration.textContent=formatTime(total);}
      progress.value=String(Number.isFinite(audio.currentTime)?audio.currentTime:0);
      if(current)current.textContent=formatTime(audio.currentTime);
      highlightAt(audio.currentTime,followEnabled);
    }

    playButton.addEventListener('click',function(){
      setStatus('',false);
      if(audio.paused){
        if(activeAudio&&activeAudio!==audio)activeAudio.pause();
        activeAudio=audio;
        var result=audio.play();
        if(result&&typeof result.catch==='function'){
          result.catch(function(){setStatus('Не вдалося відтворити аудіо.',true);});
        }
      }else{
        audio.pause();
      }
    });

    progress.addEventListener('input',function(){
      var next=Number(progress.value);
      if(Number.isFinite(next))audio.currentTime=next;
      syncProgress();
    });

    if(speed){
      try{
        var storedRate=Number(window.localStorage.getItem('wondertales-audio-playback-rate'));
        if(Number.isFinite(storedRate)&&storedRate>=0.75&&storedRate<=1.25)speed.value=String(storedRate);
      }catch(_error){}
      audio.playbackRate=Number(speed.value)||1;
      if(speedValue)speedValue.textContent=String(Number(speed.value).toFixed(2)).replace(/\\.?0+$/,'')+'×';
      speed.addEventListener('input',function(){
        var rate=Number(speed.value)||1;
        audio.playbackRate=rate;
        if(speedValue)speedValue.textContent=String(rate.toFixed(2)).replace(/\\.?0+$/,'')+'×';
        try{window.localStorage.setItem('wondertales-audio-playback-rate',String(rate));}catch(_error){}
      });
    }

    if(follow){
      follow.addEventListener('change',function(){
        if(!follow.checked){
          followEnabled=false;
          clearHighlight();
          setStatus('',false);
          return;
        }
        follow.disabled=true;
        setStatus('Готуємо синхронізацію тексту…',false);
        loadAlignment(alignmentUrl).then(function(alignment){
          var words=alignment?buildTimedText(alignment):[];
          follow.disabled=false;
          if(!words.length){
            follow.checked=false;
            followEnabled=false;
            setStatus('Синхронізація тексту недоступна.',true);
            return;
          }
          followEnabled=true;
          setStatus('',false);
          highlightAt(audio.currentTime,true);
        });
      });
    }

    audio.addEventListener('play',syncPlayState);
    audio.addEventListener('pause',syncPlayState);
    audio.addEventListener('ended',function(){syncPlayState();clearHighlight();});
    audio.addEventListener('loadedmetadata',syncProgress);
    audio.addEventListener('durationchange',syncProgress);
    audio.addEventListener('timeupdate',syncProgress);
    audio.addEventListener('error',function(){setStatus('Не вдалося завантажити аудіо.',true);});
    syncPlayState();
    syncProgress();
  });
})();`;

# Rebuild the pinned Torah dataset from the bundled source archive, not a moving API.
import json,pathlib,urllib.request,hashlib,zipfile,re
root=pathlib.Path(__file__).resolve().parents[1]/'torah-codes'
archive=root/'source/mam-torah-snapshot.zip'
previous=json.loads((root/'data/provenance.json').read_text()) if (root/'data/provenance.json').exists() else None
def source(path):
 if archive.exists():
  with zipfile.ZipFile(archive) as z: raw=z.read(path)
 else: raw=urllib.request.urlopen(f'https://raw.githubusercontent.com/bdenckla/MAM-basics/{sha}/'+path).read()
 if previous: assert hashlib.sha256(raw).hexdigest()==previous['files'][path], 'Source hash changed: '+path
 return raw
sha='f948233b08cb4809f92bd9c3be748ef55381cd97'
books=[('Gen','Bereishis','בראשית'),('Exod','Shemos','שמות'),('Lev','Vayikra','ויקרא'),('Num','Bamidbar','במדבר'),('Deut','Devarim','דברים')]
raws={};changes=[];compiled=[]
letters=lambda s:re.sub('[^א-ת]','',s)
# Select only the explicit Scripture roles. No generic recursive text collection.
def extract(o,ref,trad,record=False):
 t=o['type']
 if t in ['text','kq-trivial','kq-k','cant-combined','sdt-target','letter-large','letter-small','verse']:
  if 'text' in o:return o['text']
  return ''.join(extract(c,ref,trad,record) for c in o.get('contents',[]))
 if t=='slh-word':
  s=''.join(extract(c,ref,trad,record) for c in o['contents']);assert s==o['slhw-desc-0'];return s
 if t in ['kq','cant-all-three']:
  wanted='kq-k' if t=='kq' else 'cant-combined'
  cs=[c for c in o['contents'] if c['type']==wanted];assert len(cs)==1
  return extract(cs[0],ref,trad,record)
 if t=='scrdfftar':
  target=next(c for c in o['contents'] if c['type']=='sdt-target');note=next(c for c in o['contents'] if c['type']=='sdt-note')
  src=extract(target,ref,trad,False)
  n=note.get('text','')
  prefix=next((p for p in ['בספרי ספרד ואשכנז ','בספרי ספרד ורוב ספרי אשכנז '] if n.startswith(p)),None)
  # Exactly the nine textual alternatives documented by MAM, no inferred spellings.
  if prefix and ' ' not in n[len(prefix):] and letters(src)!=letters(n[len(prefix):]):
   alt=n[len(prefix):]
   if record:changes.append({'ref':ref,'mam':src,'standard':alt,'note':n})
   if trad=='standard' or (trad=='chabad' and ref!='Deut.23.2'):return alt
  return src
 if t in ['lp-paseq','lp-legarmeih']:return '׀'
 if t in ['spi-pe2','spi-samekh2','spi-samekh3','shirah-space']:return ' '
 if t=='spi-invnun':return ''
 raise ValueError('Unknown Scripture node '+str(t)+' at '+ref)
for bid,name,he in books:
 variant='bhs' if bid in ['Exod','Num','Deut'] else 'mam'
 path=f'MAM-simple/json-vtrad-{variant}/{bid}.json';url=f'https://raw.githubusercontent.com/bdenckla/MAM-basics/{sha}/{path}'
 raw=source(path);raws[path]=raw;x=json.loads(raw); book=x['contents'][0];assert book['osisID']==bid
 chapters=[]
 for ch in book['contents']:
  if ch['type'] in ['spi-pe2','spi-samekh2','spi-samekh3']:continue
  assert ch['type']=='chapter';verses=[]
  for v in ch['contents']:
   if v['type'] in ['spi-pe2','spi-samekh2','spi-samekh3']:continue
   if v['type']!='verse':raise ValueError(v['type'])
   strings=[extract(v,v['osisID'],t,t=='standard') for t in ['standard','chabad','yemenite']]
   assert v['osisID']==f'{bid}.{len(chapters)+1}.{len(verses)+1}'
   verses.append(strings[0] if len(set(strings))==1 else strings)
  chapters.append(verses)
 compiled.append({'id':bid,'name':name,'he':he,'chapters':chapters})
license_raw=source('LICENSE.md');raws['LICENSE.md']=license_raw
assert len(changes)==9,len(changes)
data={'schema':1,'edition':'Miqra according to the Masorah, documented Torah scroll readings','commit':sha,'versification':'BHS Hebrew chapter and verse numbering','traditions':['standard','chabad','yemenite'],'books':compiled,'scrollReadings':changes}
content=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode();(root/'data/torah.json').write_bytes(content)
manifest={'source':'https://github.com/bdenckla/MAM-basics/tree/'+sha,'commit':sha,'license':'CC BY-SA 4.0','extraction':'Written ketiv only. One combined-cantillation branch. Special letter once. Scroll variant branches as documented by MAM. No qere, notes, parashah letters, inverted-nun symbols, or repeated texts. Only U+05D0 through U+05EA are searchable.','dataSHA256':hashlib.sha256(content).hexdigest(),'files':{p:hashlib.sha256(v).hexdigest() for p,v in raws.items()},'counts':{}}
for i,t in enumerate(['standard','chabad','yemenite']):
 text='';stats=[]
 for b in compiled:
  s=''.join(letters(v if isinstance(v,str) else v[i]) for ch in b['chapters'] for v in ch);text+=s
  stats.append({'book':b['id'],'letters':len(s),'pesukim':sum(map(len,b['chapters']))})
 manifest['counts'][t]={'letters':len(text),'pesukim':sum(s['pesukim'] for s in stats),'SHA256':hashlib.sha256(text.encode()).hexdigest(),'books':stats}
 print(t,manifest['counts'][t])
 if t=='standard':
  print('Example',[(5+50*j,text[5+50*j]) for j in range(4)])
(root/'data/provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(root/'source/LICENSE.md').write_bytes(license_raw)
with zipfile.ZipFile(root/'source/mam-torah-snapshot.zip','w',zipfile.ZIP_DEFLATED,9) as z:
 for p,v in sorted(raws.items()):
  info=zipfile.ZipInfo(p,(2026,11,23,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,v)
print('DATA',len(content),manifest['dataSHA256']);print(changes)

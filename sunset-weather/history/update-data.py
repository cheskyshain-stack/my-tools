"""Replace the embedded study snapshot using its saved comparison CSV and metadata."""
import argparse,csv,datetime,json,pathlib,shutil
from zoneinfo import ZoneInfo

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--csv',required=True,type=pathlib.Path)
parser.add_argument('--details',required=True,type=pathlib.Path)
args=parser.parse_args()
meta=json.loads(args.details.read_text())
zone=ZoneInfo(meta['timezone']);records={};codes={'pending':0,'ok':1,'unavailable':2}
def instant(text):
 suffix=text[-3:];value=datetime.datetime.strptime(text[:-4],'%Y-%m-%d %I:%M:%S %p').replace(tzinfo=zone)
 if value.strftime('%Z')!=suffix:raise ValueError('Clock time zone mismatch')
 return int(value.timestamp())
with args.csv.open(newline='') as f:
 for row in csv.DictReader(f):
  if row['event'] not in ['Netz','Sunset']:raise ValueError('Unknown event')
  key=(row['date'],row['event'])
  if key in records:raise ValueError('Duplicate event')
  status=codes[row['status']];standard=instant(row['standard_local']);adjusted=instant(row['weather_adjusted_local']) if status==1 else None
  if status==1 and adjusted-standard!=int(row['difference_seconds']):raise ValueError('Difference does not match clock times')
  if status!=1 and (row['weather_adjusted_local'] or row['difference_seconds']):raise ValueError('An uncalculated result must be empty')
  records[key]=[standard,adjusted,status]
start=datetime.date.fromisoformat(meta['start_date']);end=datetime.date.fromisoformat(meta['end_date']);days=[]
date=start
while date<=end:
 text=date.isoformat();days.append([text,*records.pop((text,'Netz')),*records.pop((text,'Sunset'))]);date+=datetime.timedelta(days=1)
if records:raise ValueError('Unexpected dates outside the study')
counts={name:sum(day[i]==code for day in days for i in [3,6]) for name,code in codes.items()}
if counts!=meta['counts']:raise ValueError('Metadata coverage differs from CSV')
public={'schemaVersion':1,'place':'Lakewood, NJ (08701)','timeZone':meta['timezone'],'startDate':meta['start_date'],'endDate':meta['end_date'],'updatedAt':meta['created_utc'],'latitude':meta['latitude'],'longitude':meta['longitude'],'counts':counts,'days':days}
public.update({k:meta[k] for k in ['automation','unavailable','retryNotes'] if k in meta})
root=pathlib.Path(__file__).resolve().parent;page=root/'index.html';html=page.read_text()
before,rest=html.split('<!-- HISTORY_DATA_START -->');_,after=rest.split('<!-- HISTORY_DATA_END -->')
payload=json.dumps(public,separators=(',',':')).replace('<','\\u003c')
page.write_text(before+'<!-- HISTORY_DATA_START -->\n<script type="application/json" id="historyData">'+payload+'</script>\n<!-- HISTORY_DATA_END -->'+after)
if args.csv.resolve()!=(root/'lakewood-comparison.csv').resolve():shutil.copyfile(args.csv,root/'lakewood-comparison.csv')
print(json.dumps({'days':len(days),'counts':counts,'embedded_bytes':len(payload)}))

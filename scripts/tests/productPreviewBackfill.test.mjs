import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

test('historical product preview backfill preserves scope, originals and concurrent edits', () => {
  const result = execFileSync('python3', ['-c', `
import importlib.util, unittest, sys
spec=importlib.util.spec_from_file_location('backfill',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Contracts(unittest.TestCase):
 def test_scope(self):
  snapshot={'catalogs':[{'id':'m','slug':'mangal'}], 'product_images':[{'id':'1','catalog_id':'f','url':'/photo.jpg'},{'id':'2','catalog_id':'f','url':''}], 'product':[{'id':'p','image_url':'/photo.jpg','image_urls':['/photo.jpg','/second.jpg']}], 'orders':[{'image_url':'/private.jpg'}]}
  refs=m.references(snapshot)
  self.assertEqual(set(refs),{('f','/photo.jpg'),('m','/photo.jpg'),('m','/second.jpg')})
  self.assertEqual(refs[('m','/photo.jpg')],2)
 def test_safe_urls(self):
  self.assertEqual(m.source_url('/assets/a.jpg'),'https://wayyaam.ru/assets/a.jpg')
  self.assertEqual(m.source_url('/catalogg/assets/a.jpg'),'https://wayyaam.ru/assets/a.jpg')
  self.assertEqual(m.source_url('https://images.unsplash.com/photo-1?w=800'),'https://wayyaam.ru/media/unsplash/photo-1?w=800')
  self.assertEqual(m.source_url('https://images.unsplash.com/photo-1?w=800&lemon tea'),'https://wayyaam.ru/media/unsplash/photo-1?w=800&lemon%20tea')
  self.assertEqual(m.source_url('https://api.wayyaam.ru/storage/file.jpg'),'https://api.wayyaam.ru/storage/file.jpg')
  for value in ['//evil.test/photo','http://127.0.0.1/x','http://wayyaam.ru/assets/a.jpg','https://evil.test/x','file:///etc/passwd','/api/private','data:image/svg+xml,x','https://wayyaam.ru.evil.test/x']:
   with self.assertRaises(ValueError): m.source_url(value)
 def test_existing_variants(self):
  url='https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/c/media/'+'a'*64+'.full-v1.jpg'
  self.assertTrue(m.has_preview(url))
  self.assertFalse(m.has_preview('/old.jpg'))
 def test_updates(self):
  snap={'catalogs':[{'slug':'mangal','id':'m'}], 'product_images':[{'id':'1','catalog_id':'f','url':'old'}], 'product':[{'id':'p','title':'unchanged','image_url':'old','image_urls':['old','keep']}]}
  plan=[{'catalog_id':'f','source':'old','target':'new-f'}, {'catalog_id':'m','source':'old','target':'new-m'}]
  updates=m.updates(snap,plan)
  self.assertEqual(updates,[{'table':'product_images','id':'1','before':{'url':'old'},'after':{'url':'new-f'}},{'table':'product','id':'p','before':{'image_url':'old','image_urls':['old','keep']},'after':{'image_url':'new-m','image_urls':['new-m','keep']}}])
  self.assertEqual(m.updates({'catalogs':snap['catalogs'],'product_images':[{'id':'1','catalog_id':'f','url':'new-f'}],'product':[]},plan),[])
 def test_cas(self):
  query=m.transaction([{'table':'product_images','id':"a'b",'before':{'url':"old'url"},'after':{'url':'new'}}])
  self.assertIn('BEGIN;',query);self.assertIn('COMMIT;',query)
  self.assertIn("a''b",query);self.assertIn("old''url",query)
  self.assertIn('IF changed <> 1 THEN',query);self.assertIn('GET DIAGNOSTICS',query);self.assertIn('RAISE EXCEPTION',query)
  self.assertIn('IS NOT DISTINCT FROM',query)
  with self.assertRaises(ValueError):m.transaction([{'table':'orders','id':'o','before':{'url':'old'},'after':{'url':'new'}}])
  with self.assertRaises(ValueError):m.transaction([{'table':'product','id':'p','before':{'title':'old'},'after':{'title':'new'}}])
unittest.main(argv=['contracts'])
`, process.env.BACKFILL_SCRIPT || 'scripts/backfill-product-previews.py'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result, '');
});

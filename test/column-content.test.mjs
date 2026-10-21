import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bindRegions} from '@openpresentation/opf/composition';
import {composeSlide} from '@openpresentation/opf/composition';
import {resolveSlideContext} from '@openpresentation/opf';
import {readCatalog} from '../scripts/build.mjs';
import {SAMPLE_BLOCKS} from '../scripts/fixtures.mjs';

const {gallery} = await readCatalog();

for (const [id,count] of [['two-column',2],['three-column',3]]) {
  for (const [kind,payload] of Object.entries({...SAMPLE_BLOCKS,group:{blocks:[{text:'Related evidence'}]}})) {
    test(`${id} binds ${count} ${kind} blocks to separate columns without warnings`,()=>{
      const slide = {title:'Compare the evidence',blocks:Array.from({length:count},()=>structuredClone(payload))};
      const binding = bindRegions(slide,gallery.layouts[id]);
      assert.deepEqual(binding.diagnostics,[]);
      assert.deepEqual(binding.below,[]);
      assert.deepEqual(binding.regions.map(region=>({name:region.name,blocks:region.blocks.map(block=>block.path),overflow:region.overflow})),
        ['first','second','third'].slice(0,count).map((name,index)=>({name,blocks:[`slides.0.blocks.${index}`],overflow:[]})));
    });
  }
  test(`${id} preserves whole pictures by default and honors explicit cover fit`,()=>{
    const deck={name:'Whole pictures',slides:[{layout:id,title:'Keep the full source visible',blocks:[
      {image:SAMPLE_BLOCKS.image.image},
      {image:SAMPLE_BLOCKS.image.image,fit:'cover'},
      ...(count===3?[{image:SAMPLE_BLOCKS.image.image,fit:'stretch'}]:[]),
    ]}]};
    const context=resolveSlideContext(deck,0,{catalogs:[gallery],strictReferences:true});
    const geometry=composeSlide(context.slide,context.options);
    assert.deepEqual(geometry.items.filter(item=>item.type==='image').map(item=>item.image.fit),['contain','cover',...(count===3?['stretch']:[])]);
  });
}

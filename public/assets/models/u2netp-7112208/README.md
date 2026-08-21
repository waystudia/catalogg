---
library_name: transformers
pipeline_tag: image-segmentation
tags:
  - image-segmentation
  - mask-generation
  - transformers.js
  - vision
  - background-removal
  - portrait-matting
license: apache-2.0
language:
  - en
---
# U-2-Netp

## Model Description
U-2-Netp is a lightweight version of the U2Net model designed for efficient and effective image segmentation tasks, especially for generating masks. It retains the core architectural design of U2Net while being optimized for faster inference times and reduced memory usage.

## Usage
Perform mask generation with `BritishWerewolf/U-2-Netp`.

### Example
```javascript
import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';

const img_url = 'https://huggingface.co/ybelkada/segment-anything/resolve/main/assets/car.png';
const image = await RawImage.read(img_url);

const processor = await AutoProcessor.from_pretrained('BritishWerewolf/U-2-Netp');
const processed = await processor(image);

const model = await AutoModel.from_pretrained('BritishWerewolf/U-2-Netp', {
    dtype: 'fp32',
});

const output = await model({ input: processed.pixel_values });
// {
//   mask: Tensor {
//     dims: [ 1, 320, 320 ],
//     type: 'uint8',
//     data: Uint8Array(102400) [ ... ],
//     size: 102400
//   }
// }
```

## Model Architecture
The U-2-Netp model is based on a simplified version of the original U2Net architecture, designed to be more lightweight while still achieving high performance in segmentation tasks. The model consists of several stages with down-sampling and up-sampling paths, using Residual U-blocks (RSU) for enhanced feature representation.

### Inference
To use the model for inference, you can follow the example provided above. The `AutoProcessor` and `AutoModel` classes from the `transformers` library make it easy to load the model and processor.

## Credits
* [`rembg`](https://github.com/danielgatis/rembg) for the ONNX model.
* The authors of the original U-2-Net model can be credited at https://github.com/xuebinqin/U-2-Net.

## Licence
This model is licensed under the Apache License 2.0 to match the original U-2-Net model.

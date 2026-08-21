---
license: apache-2.0
library_name: transformers.js
pipeline_tag: image-segmentation
tags:
- onnx
- background-removal
- dichotomous-image-segmentation
---

# isnet-general-use (ONNX, fp16 / q8)

ONNX builds of **ISNet (general use)** from
[xuebinqin/DIS](https://github.com/xuebinqin/DIS) (Apache-2.0),
packaged for [Transformers.js](https://huggingface.co/docs/transformers.js).

- Source ONNX export: the `isnet-general-use.onnx` distributed by the
  [rembg](https://github.com/danielgatis/rembg) project (MIT); original
  weights and architecture by Xuebin Qin et al. (DIS, Apache-2.0).
- Modifications: the 11 auxiliary graph outputs (side stages d2-d6 and
  intermediate feature taps) were removed, keeping only `output_image`
  (stage-1 sigmoid probability map). fp16 and dynamic-int8 (q8) variants
  were generated with the official Transformers.js conversion scripts.

## I/O

- Input `input_image`: float32 `[1, 3, 1024, 1024]`, RGB,
  normalized as `x / 255 - 0.5` (mean 0.5, std 1.0).
- Output `output_image`: float32 `[1, 1, 1024, 1024]`, sigmoid
  probabilities. Min-max normalize per image for an alpha matte
  (as done by rembg).

## Files

- `onnx/model.onnx` - fp32 (aux outputs stripped)
- `onnx/model_fp16.onnx` - fp16
- `onnx/model_quantized.onnx` - dynamic int8 (q8)

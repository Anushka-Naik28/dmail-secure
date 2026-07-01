from PIL import Image

def remove_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()

    new_data = []
    # Loop over every pixel
    for item in data:
        # item is a tuple: (R, G, B, A)
        r, g, b, a = item
        
        # If the pixel is mostly gray/dark (checkerboard or solid background)
        # Check if R, G, B are similar to each other
        if abs(r - g) < 20 and abs(g - b) < 20 and abs(r - b) < 20:
            # It's a shade of gray; let's make it transparent
            new_data.append((255, 255, 255, 0))
        else:
            # It's not gray (it's part of the gold logo)
            new_data.append((r, g, b, a))

    img.putdata(new_data)
    img.save(output_path)
    print("Background removed and saved to", output_path)

remove_background("public/logo-combined.png", "public/logo-combined-nobg.png")

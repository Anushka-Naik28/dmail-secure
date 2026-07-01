from PIL import Image
import math

def remove_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()

    new_data = []
    # Loop over every pixel
    for item in data:
        r, g, b, a = item
        
        # Calculate maximum color channel as alpha
        # This perfectly preserves the color intensity and removes the black background
        alpha = int(max(r, g, b))
        
        if alpha == 0:
            new_data.append((0, 0, 0, 0))
        else:
            # Un-premultiply the RGB channels so the color stays bright
            # even when it's semi-transparent
            nr = int(min(255, (r * 255) / alpha))
            ng = int(min(255, (g * 255) / alpha))
            nb = int(min(255, (b * 255) / alpha))
            
            # Apply a slight gamma curve to alpha to keep edges smooth but drop dark noise
            gamma_alpha = int(255 * math.pow(alpha / 255.0, 1.2))
            
            new_data.append((nr, ng, nb, gamma_alpha))

    img.putdata(new_data)
    img.save(output_path)
    print("Background removed perfectly and saved to", output_path)

if __name__ == "__main__":
    remove_background("c:/Users/joshi/OneDrive/Desktop/email/frontend/public/logo-combined.png", "c:/Users/joshi/OneDrive/Desktop/email/frontend/public/logo-combined-nobg.png")

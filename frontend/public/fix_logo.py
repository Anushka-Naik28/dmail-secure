from PIL import Image

def process():
    img = Image.open('c:/Users/joshi/OneDrive/Desktop/email/frontend/public/logo.png').convert('RGBA')
    data = img.getdata()
    new_data = []
    gold = (212, 160, 23)
    
    for item in data:
        # Calculate grayscale average
        avg = (item[0] + item[1] + item[2]) / 3.0
        
        # Black background (avg=~0) becomes transparent (alpha=0)
        # White lines (avg=~255) becomes opaque (alpha=255)
        alpha = int(avg)
        
        new_data.append((gold[0], gold[1], gold[2], alpha))
        
    img.putdata(new_data)
    img.save('c:/Users/joshi/OneDrive/Desktop/email/frontend/public/logo-gold-final.png')
    print("Done")

if __name__ == "__main__":
    process()

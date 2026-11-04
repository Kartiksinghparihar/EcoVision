
import requests

url = "http://127.0.0.1:8000/api/inference/ecovision-pi-zero-01"

headers = {
    "X-Device-Key": "JNm_xYuMzcI1DcbYtCYhymINJ2m7i5rKsjUz9AmHmYM"
}

image_path = r"C:\Users\HP\Downloads\big-himalayan-monkey-trap-fence-125833049.webp"

try:
    with open(image_path, "rb") as image:
        response = requests.post(
            url,
            headers=headers,
            files={"file": ("test.webp", image, "image/webp")},
            data={"temperature": "0", "humidity": "0"},
            timeout=120
        )

    print("Status:", response.status_code)
    print("Response:", response.text)

except FileNotFoundError:
    print("Image not found. Correct the image_path.")

except requests.exceptions.RequestException as error:
    print("Request error:", error)

# gestures.py
import cv2
import time
from model_infer import ISLModel

class GestureRecognizer:
    def __init__(self):
        self.model = ISLModel()
        self.last_letter = None
        self.stable_count = 0
        self.final_text = ""
        self.last_space_time = time.time()
        self.space_timeout = 2.0  # seconds of no detection → add space
        self.last_sent_text = ""


    def recognize_gesture(self, frame):
        letter = self.model.predict(frame)

        # if model predicts a letter
        if letter:
            if letter == self.last_letter:
                self.stable_count += 1
            else:
                self.last_letter = letter
                self.stable_count = 1

            # add letter only if it’s stable for several frames
            if self.stable_count >= 4:  # adjust 3–5 depending on speed
                if not self.final_text or self.final_text[-1] != letter:
                    self.final_text += letter
                self.last_space_time = time.time()

        # if no hand detected
        else:
            # reset counters
            self.last_letter = None
            self.stable_count = 0

            # if no hand for 2 seconds → add space
            if time.time() - self.last_space_time > self.space_timeout:
                if not self.final_text or self.final_text[-1] != " ":
                    self.final_text += " "
                self.last_space_time = time.time()

        # return frame (for preview) and the full sentence so far
        return frame, self.final_text.strip()

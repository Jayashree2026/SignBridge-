# model_infer.py
import torch
import torch.nn as nn
import mediapipe as mp
import numpy as np

class LandmarkCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv1d(1, 32, 3, padding=1)
        self.pool = nn.MaxPool1d(2, 2)
        self.conv2 = nn.Conv1d(32, 64, 3, padding=1)
        self.fc1 = nn.Linear(64 * 31, 128)
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(128, 36)

    def forward(self, x):
        x = self.pool(torch.relu(self.conv1(x)))
        x = self.pool(torch.relu(self.conv2(x)))
        x = x.view(-1, 64 * 31)
        x = torch.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x


class ISLModel:
    def __init__(self, model_path="./isl_model_landmark_cnn_check.pt"):
        self.device = torch.device("cpu")
        self.model = LandmarkCNN()
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval()
        self.mp_hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=2, min_detection_confidence=0.4)
        self.classes = [chr(65 + i) for i in range(26)] + [str(i) for i in range(10)]

    def predict(self, frame):
        import cv2
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.mp_hands.process(rgb_frame)

        if not results.multi_hand_landmarks:
            return None

        landmarks = []
        for hand_landmarks in results.multi_hand_landmarks[:2]:
            hand_lm = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]).flatten()
            if len(hand_lm) == 63:
                base = hand_lm[:3]
                hand_lm = hand_lm - np.tile(base, 21)
                norm = np.max(np.abs(hand_lm))
                if norm > 0:
                    hand_lm = hand_lm / norm
                landmarks.extend(hand_lm)

        if len(landmarks) == 126:
            x = torch.tensor(landmarks, dtype=torch.float32).view(1, 1, 126).to(self.device)
        elif len(landmarks) == 63:
            x = torch.tensor(landmarks + [0]*63, dtype=torch.float32).view(1, 1, 126).to(self.device)
        else:
            return None

        with torch.no_grad():
            pred_idx = self.model(x).argmax(dim=1).item()
        return self.classes[pred_idx]

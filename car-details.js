import { ref, onValue, update, push } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { logEvent } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

const database = window.firebaseDatabase;
const auth = window.firebaseAuth;
const analytics = window.firebaseAnalytics;

let currentUser = null;
let carId = null;
let car = null;
let currentImageIndex = 0;
let currentImages = [];
let messages = []; // Додаємо масив для повідомлень

window.onload = () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = { uid: user.uid };
      const userRef = ref(database, `users/${user.uid}`);
      onValue(userRef, snapshot => {
        const userData = snapshot.val();
        if (userData) {
          currentUser = { ...currentUser, ...userData };
        }
        loadCarDetails();
        loadMessages(); // Завантажуємо повідомлення
      }, { onlyOnce: true });
    } else {
      loadCarDetails();
      loadMessages(); // Завантажуємо повідомлення
    }
  });
};

function loadCarDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  carId = urlParams.get('id');
  if (!carId) {
    document.getElementById('carDetails').innerHTML = '<p>Авто не знайдено.</p>';
    return;
  }

  const carRef = ref(database, `cars/${carId}`);
  onValue(carRef, snapshot => {
    car = snapshot.val();
    if (car) {
      car.id = carId;
      logEvent(analytics, 'view_car', {
        car_id: carId,
        car_brand: car.brand,
        car_model: car.model,
        user_id: currentUser ? currentUser.uid : 'anonymous'
      });
      displayCarDetails();
    } else {
      document.getElementById('carDetails').innerHTML = '<p>Авто не знайдено.</p>';
    }
  }, { onlyOnce: true });
}

// Завантаження повідомлень
function loadMessages() {
  const messagesRef = ref(database, 'messages');
  onValue(messagesRef, snapshot => {
    messages = [];
    snapshot.forEach(childSnapshot => {
      const message = childSnapshot.val();
      message.id = childSnapshot.key;
      messages.push(message);
    });
  }, { onlyOnce: true });
}

function displayCarDetails() {
  document.getElementById('carTitle').innerText = `${car.brand} ${car.model}`;
  const carImages = document.getElementById('carImages');
  carImages.innerHTML = '';
  car.images.forEach(img => {
    const imgElement = document.createElement('img');
    imgElement.src = img;
    imgElement.onclick = () => showFullscreenImage(img, car.images);
    carImages.appendChild(imgElement);
  });
  document.getElementById('carBodyType').innerText = `Тип кузова: ${car.bodyType}`;
  document.getElementById('carYear').innerText = `Рік: ${car.year}`;
  document.getElementById('carPrice').innerText = `Ціна: $${car.price}`;
  document.getElementById('carMileage').innerText = `Пробіг: ${car.mileage} км`;
  document.getElementById('carLocation').innerText = `Місто: ${car.location}`;
  document.getElementById('carCondition').innerText = `Стан: ${car.condition}`;
  document.getElementById('carDescription').innerText = `Опис: ${car.description}`;
  document.getElementById('carSeller').innerText = `Продавець: ${car.seller}`;
  document.getElementById('carContact').innerText = `Контакти: ${car.contact}`;
  const averageRating = car.ratingCount > 0 ? (car.rating / car.ratingCount).toFixed(1) : 'Немає';
  document.getElementById('carRating').innerText = averageRating;
  const stars = document.getElementById('ratingStars').getElementsByTagName('span');
  for (let i = 0; i < stars.length; i++) {
    stars[i].classList.remove('active');
  }
  const rating = Math.round(averageRating);
  for (let i = 0; i < rating; i++) {
    stars[i].classList.add('active');
  }
  document.getElementById('messageCarId').value = carId;
  document.getElementById('messageRecipient').value = car.seller;
}

function rateCar(rating) {
  if (!currentUser) {
    alert('Увійдіть, щоб оцінити авто!');
    window.location.href = 'index.html';
    return;
  }
  const newRating = (car.rating || 0) + rating;
  const newRatingCount = (car.ratingCount || 0) + 1;
  update(ref(database, `cars/${carId}`), {
    rating: newRating,
    ratingCount: newRatingCount
  })
    .then(() => {
      alert('Дякуємо за вашу оцінку!');
      loadCarDetails();
    })
    .catch(error => {
      console.error('Помилка оцінки авто:', error);
      alert('Помилка: ' + error.message);
    });
}

function showFullscreenImage(imageUrl, images) {
  currentImages = images;
  currentImageIndex = images.indexOf(imageUrl);
  document.getElementById('fullscreenImage').src = imageUrl;
  document.getElementById('fullscreenImageModal').style.display = 'block';
}

function closeFullscreenImageModal() {
  document.getElementById('fullscreenImageModal').style.display = 'none';
}

function changeFullscreenImage(direction) {
  currentImageIndex += direction;
  if (currentImageIndex < 0) {
    currentImageIndex = currentImages.length - 1;
  } else if (currentImageIndex >= currentImages.length) {
    currentImageIndex = 0;
  }
  document.getElementById('fullscreenImage').src = currentImages[currentImageIndex];
}

function showMessageModal() {
  if (!currentUser) {
    alert('Увійдіть, щоб надіслати повідомлення!');
    window.location.href = 'index.html';
    return;
  }
  if (currentUser.username === car.seller) {
    alert('Ви не можете надіслати повідомлення самому собі!');
    return;
  }
  displayConversationHistory(car.seller); // Відображаємо історію листування
  document.getElementById('messageModal').style.display = 'block';
}

function closeMessageModal() {
  document.getElementById('messageModal').style.display = 'none';
  document.getElementById('conversationHistory').innerHTML = '';
}

// Відображення історії листування
function displayConversationHistory(recipient) {
  const historyDiv = document.getElementById('conversationHistory');
  historyDiv.innerHTML = '';

  const conversation = messages.filter(msg =>
    (msg.sender === currentUser.username && msg.recipient === recipient) ||
    (msg.sender === recipient && msg.recipient === currentUser.username)
  );

  conversation.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  conversation.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(msg.sender === currentUser.username ? 'sent' : 'received');
    msgDiv.innerHTML = `
      <p><strong>${msg.sender}:</strong> ${msg.text}</p>
      <p><small>${msg.timestamp}</small></p>
    `;
    historyDiv.appendChild(msgDiv);
  });

  historyDiv.scrollTop = historyDiv.scrollHeight;
}

document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const carId = document.getElementById('messageCarId').value;
  const recipient = document.getElementById('messageRecipient').value;
  const messageText = document.getElementById('messageText').value;

  const message = {
    sender: currentUser.username,
    recipient: recipient,
    carId: carId,
    text: messageText,
    timestamp: new Date().toLocaleString('uk-UA'), // Змінено формат часу
    read: false
  };

  // Зберігаємо повідомлення у Firebase
  const messagesRef = ref(database, 'messages');
  push(messagesRef, message)
    .then(() => {
      // Додаємо сповіщення для одержувача
      let notificationMessage = `Нове повідомлення від ${currentUser.username}`;
      if (carId) {
        notificationMessage += ` щодо ${car.brand} ${car.model}`;
      }
      const notification = {
        recipient: recipient,
        message: notificationMessage,
        timestamp: new Date().toLocaleString('uk-UA'),
        read: false
      };
      push(ref(database, 'notifications'), notification);
      alert('Повідомлення надіслано!');
      displayConversationHistory(recipient); // Оновлюємо історію листування
      document.getElementById('messageText').value = '';
    })
    .catch(error => {
      console.error('Помилка надсилання повідомлення:', error);
      alert('Помилка: ' + error.message);
    });
});

function addToFavorites() {
  if (!currentUser) {
    alert('Увійдіть, щоб додати авто до обраного!');
    window.location.href = 'index.html';
    return;
  }

  const favoritesRef = ref(database, `users/${currentUser.uid}/favorites`);
  onValue(favoritesRef, snapshot => {
    let favorites = snapshot.val() || [];
    if (!favorites.includes(carId)) {
      favorites.push(carId);
      update(ref(database, `users/${currentUser.uid}`), { favorites })
        .then(() => {
          alert('Авто додано до обраного!');
        })
        .catch(error => {
          console.error('Помилка:', error);
          alert('Помилка: ' + error.message);
        });
    } else {
      alert('Авто вже у обраному!');
    }
  }, { onlyOnce: true });
}

function addToCompare() {
  if (!currentUser) {
    alert('Увійдіть, щоб додати авто до порівняння!');
    window.location.href = 'index.html';
    return;
  }

  const compareRef = ref(database, `users/${currentUser.uid}/compare`);
  onValue(compareRef, snapshot => {
    let compare = snapshot.val() || [];
    if (compare.length >= 3) {
      alert('Ви можете додати до порівняння не більше 3 авто!');
      return;
    }
    if (!compare.includes(carId)) {
      compare.push(carId);
      update(ref(database, `users/${currentUser.uid}`), { compare })
        .then(() => {
          alert('Авто додано до порівняння!');
        })
        .catch(error => {
          console.error('Помилка:', error);
          alert('Помилка: ' + error.message);
        });
    } else {
      alert('Авто вже у порівнянні!');
    }
  }, { onlyOnce: true });
}

window.rateCar = rateCar;
window.showFullscreenImage = showFullscreenImage;
window.closeFullscreenImageModal = closeFullscreenImageModal;
window.changeFullscreenImage = changeFullscreenImage;
window.showMessageModal = showMessageModal;
window.closeMessageModal = closeMessageModal;
window.addToFavorites = addToFavorites;
window.addToCompare = addToCompare;
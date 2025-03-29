// Імпортуємо необхідні функції Firebase
import { ref, onValue, push, set, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { logEvent } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

// Отримуємо доступ до бази даних, авторизації та аналітики
const database = window.firebaseDatabase;
const auth = window.firebaseAuth;
const analytics = window.firebaseAnalytics;

// Глобальні змінні
let cars = [];
let users = [];
let profiles = {};
let favorites = {};
let messages = [];
let notifications = [];
let compareList = {};
let currentUser = null;
let isAuthenticated = false;
let currentCarId = null;

const carsPerPage = 20;
let currentPage = 1;
let filteredCars = [];

const authStatus = document.getElementById('authStatus');
const authButton = document.getElementById('authButton');
const addCarBtn = document.getElementById('addCarBtn');

// Локальне кешування
const cache = {
  cars: null,
  favorites: null,
  compareList: null,
  lastUpdated: null
};

// Функція для завантаження зображень у Cloudinary
async function uploadToCloudinary(file) {
  const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dhcfbg2j8/image/upload'; 
  const UPLOAD_PRESET = 'unsigned_upload'; 

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (data.secure_url) {
      return data.secure_url;
    } else {
      throw new Error('Помилка завантаження зображення в Cloudinary');
    }
  } catch (error) {
    console.error('Помилка завантаження зображення:', error);
    throw error;
  }
}

// Завантаження даних при старті
window.onload = () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = { uid: user.uid, email: user.email };
      loadUserData(user.uid);
      isAuthenticated = true;
      updateAuthStatus();
    } else {
      isAuthenticated = false;
      currentUser = null;
      updateAuthStatus();
    }
    loadCars();
    loadFavorites();
    loadCompareList();
    loadMessages();
    loadNotifications();
    loadFilters();
    filterCars(1);
  });
};

// Завантаження даних користувача
function loadUserData(uid) {
  const userRef = ref(database, `users/${uid}`);
  onValue(userRef, snapshot => {
    const userData = snapshot.val();
    if (userData) {
      currentUser = { ...currentUser, ...userData };
      updateAuthStatus();
    }
  });
}

// Завантаження авто
function loadCars() {
  const now = Date.now();
  if (cache.cars && cache.lastUpdated && (now - cache.lastUpdated) < 60000) {
    cars = cache.cars;
    filterCars(currentPage);
    return;
  }

  const carsRef = ref(database, 'cars');
  onValue(carsRef, snapshot => {
    cars = [];
    snapshot.forEach(childSnapshot => {
      const car = childSnapshot.val();
      car.id = childSnapshot.key;
      cars.push(car);
    });
    cache.cars = cars;
    cache.lastUpdated = now;
    filterCars(currentPage);
  }, { onlyOnce: true });
}

// Завантаження обраних
function loadFavorites() {
  if (!currentUser) return;
  const now = Date.now();
  if (cache.favorites && cache.lastUpdated && (now - cache.lastUpdated) < 60000) {
    favorites[currentUser.uid] = cache.favorites;
    displayFavorites();
    return;
  }

  const favoritesRef = ref(database, `favorites/${currentUser.uid}`);
  onValue(favoritesRef, snapshot => {
    favorites[currentUser.uid] = snapshot.val() || [];
    cache.favorites = favorites[currentUser.uid];
    cache.lastUpdated = now;
    displayFavorites();
  }, { onlyOnce: true });
}

// Завантаження списку порівняння
function loadCompareList() {
  if (!currentUser) return;
  const now = Date.now();
  if (cache.compareList && cache.lastUpdated && (now - cache.lastUpdated) < 60000) {
    compareList[currentUser.uid] = cache.compareList;
    displayCompareList();
    return;
  }

  const compareListRef = ref(database, `compareList/${currentUser.uid}`);
  onValue(compareListRef, snapshot => {
    compareList[currentUser.uid] = snapshot.val() || [];
    cache.compareList = compareList[currentUser.uid];
    cache.lastUpdated = now;
    displayCompareList();
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
    displayMessages();
  });
}

// Завантаження сповіщень
function loadNotifications() {
  const notificationsRef = ref(database, 'notifications');
  onValue(notificationsRef, snapshot => {
    notifications = [];
    snapshot.forEach(childSnapshot => {
      const notification = childSnapshot.val();
      notification.id = childSnapshot.key;
      notifications.push(notification);
    });
    updateNotificationCount();
    displayNotifications();
  }, { onlyOnce: true });
}

// Оновлення статусу авторизації
function updateAuthStatus() {
  if (isAuthenticated && currentUser) {
    authStatus.innerText = `Ви авторизовані як ${currentUser.username}`;
    authButton.innerText = 'Вийти';
    authButton.onclick = logout;
    addCarBtn.disabled = false;
    updateNotificationCount();
    displayProfile();
  } else {
    authStatus.innerText = 'Ви не авторизовані';
    authButton.innerText = 'Увійти';
    authButton.onclick = showLoginModal;
    addCarBtn.disabled = true;
  }
  displayFavorites();
  displayCompareList();
  displayNotifications();
}

// Вихід із системи
function logout() {
  signOut(auth)
    .then(() => {
      currentUser = null;
      isAuthenticated = false;
      updateAuthStatus();
      alert('Ви вийшли з системи!');
    })
    .catch(error => {
      console.error('Помилка виходу:', error);
      alert('Помилка: ' + error.message);
    });
}

// Оновлення кількості сповіщень
function updateNotificationCount() {
  if (!currentUser) {
    document.getElementById('notificationCount').innerText = '0';
    return;
  }
  const unreadNotifications = notifications.filter(n => n.recipient === currentUser.username && !n.read).length;
  document.getElementById('notificationCount').innerText = unreadNotifications;
}

// Модальні вікна
function showLoginModal() {
  document.getElementById('loginModal').style.display = 'block';
}

function closeLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginForm').reset();
}

function showRegisterModal() {
  document.getElementById('registerModal').style.display = 'block';
}

function closeRegisterModal() {
  document.getElementById('registerModal').style.display = 'none';
  document.getElementById('registerForm').reset();
}

function showResetPasswordModal() {
  closeLoginModal();
  document.getElementById('resetPasswordModal').style.display = 'block';
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal').style.display = 'none';
  document.getElementById('resetPasswordForm').reset();
}

function showMessageModal() {
  if (!isAuthenticated) {
    alert('Увійдіть, щоб надіслати повідомлення!');
    showLoginModal();
    return;
  }
  const car = cars.find(c => c.id === currentCarId);
  if (car) {
    document.getElementById('messageCarId').value = currentCarId;
    document.getElementById('messageRecipient').value = car.seller;
    displayConversationHistory(car.seller);
    document.getElementById('messageModal').style.display = 'block';
  }
}

function closeMessageModal() {
  document.getElementById('messageModal').style.display = 'none';
  document.getElementById('messageForm').reset();
  document.getElementById('conversationHistory').innerHTML = '';
}

function showNotifications() {
  document.getElementById('notificationModal').style.display = 'block';

  // Позначимо всі сповіщення як прочитані
  const unreadNotifications = notifications.filter(
    n => n.recipient === currentUser.username && !n.read
  );

  const updates = {};
  unreadNotifications.forEach(notification => {
    updates[`notifications/${notification.id}/read`] = true;
  });

  if (Object.keys(updates).length > 0) {
    update(ref(database), updates)
      .then(() => {
        // Оновлюємо локальний масив notifications
        unreadNotifications.forEach(notification => {
          const notificationIndex = notifications.findIndex(n => n.id === notification.id);
          if (notificationIndex !== -1) {
            notifications[notificationIndex].read = true;
          }
        });
        updateNotificationCount(); // Оновлюємо лічильник
        displayNotifications(); // Оновлюємо список сповіщень
      })
      .catch(error => {
        console.error('Помилка позначення сповіщень як прочитаних:', error);
        alert('Помилка: ' + error.message);
      });
  }
}

function closeNotifications() {
  document.getElementById('notificationModal').style.display = 'none';
}

function showAddCarForm() {
  if (!isAuthenticated) {
    alert('Увійдіть, щоб додати авто!');
    showLoginModal();
    return;
  }
  document.getElementById('addCarModal').style.display = 'block';
}

function closeAddCarModal() {
  document.getElementById('addCarModal').style.display = 'none';
  document.getElementById('addCarForm').reset();
}

function showEditCarModal(carId) {
  if (!isAuthenticated) {
    alert('Увійдіть, щоб редагувати авто!');
    showLoginModal();
    return;
  }
  const car = cars.find(c => c.id === carId);
  if (car && car.seller === currentUser.username) {
    document.getElementById('editCarId').value = carId;
    document.getElementById('editBrand').value = car.brand;
    document.getElementById('editModel').value = car.model;
    document.getElementById('editBodyType').value = car.bodyType;
    document.getElementById('editCondition').value = car.condition;
    document.getElementById('editLocation').value = car.location;
    document.getElementById('editYear').value = car.year;
    document.getElementById('editPrice').value = car.price;
    document.getElementById('editMileage').value = car.mileage;
    document.getElementById('editDescription').value = car.description;
    document.getElementById('editContact').value = car.contact;
    document.getElementById('editCarModal').style.display = 'block';
  } else {
    alert('Ви можете редагувати лише свої оголошення!');
  }
}

function closeEditCarModal() {
  document.getElementById('editCarModal').style.display = 'none';
  document.getElementById('editCarForm').reset();
}

let currentImageIndex = 0;
let currentImages = [];

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

// Перевірка пароля
function isPasswordValid(password) {
  const minLength = 8;
  const hasNumber = /\d/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  return password.length >= minLength && hasNumber && hasUpperCase;
}

// Обробка входу
document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  signInWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      const user = userCredential.user;
      loadUserData(user.uid);
      closeLoginModal();
    })
    .catch(error => {
      console.error('Помилка входу:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        alert('Неправильний email або пароль!');
      } else {
        alert('Помилка входу: ' + error.message);
      }
    });
});

// Обробка реєстрації
document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('newUsername').value;
  const name = document.getElementById('newName').value;
  const phone = document.getElementById('newPhone').value;
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;

  if (!isPasswordValid(password)) {
    alert('Пароль повинен містити щонайменше 8 символів, 1 цифру та 1 велику літеру!');
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      const user = userCredential.user;
      logEvent(analytics, 'sign_up', {
        user_id: user.uid,
        method: 'email'
      });
      const userData = { username, name, phone, email, uid: user.uid };
      set(ref(database, `users/${user.uid}`), userData)
        .then(() => {
          alert('Реєстрація успішна! Тепер увійдіть.');
          closeRegisterModal();
        })
        .catch(error => {
          console.error('Помилка збереження даних користувача:', error);
          alert('Помилка реєстрації: ' + error.message);
        });
    })
    .catch(error => {
      console.error('Помилка реєстрації:', error);
      alert('Помилка реєстрації: ' + error.message);
    });
});

// Обробка скидання пароля
document.getElementById('resetPasswordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('resetEmail').value;

  sendPasswordResetEmail(auth, email)
    .then(() => {
      alert('Посилання для скидання пароля надіслано на ваш email!');
      closeResetPasswordModal();
    })
    .catch(error => {
      console.error('Помилка скидання пароля:', error);
      if (error.code === 'auth/user-not-found') {
        alert('Користувача з таким email не знайдено!');
      } else {
        alert('Помилка: ' + error.message);
      }
    });
});

// Обробка додавання авто
document.getElementById('addCarForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const brand = document.getElementById('newBrand').value;
  const model = document.getElementById('newModel').value;
  const bodyType = document.getElementById('newBodyType').value;
  const condition = document.getElementById('newCondition').value;
  const location = document.getElementById('newLocation').value;
  const year = parseInt(document.getElementById('newYear').value);
  const price = parseInt(document.getElementById('newPrice').value);
  const mileage = parseInt(document.getElementById('newMileage').value);
  const description = document.getElementById('newDescription').value;
  const contact = document.getElementById('newContact').value;
  const imagesInput = document.getElementById('newImages');

  const imageFiles = Array.from(imagesInput.files);
  const compressPromises = imageFiles.map(file => {
    return new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.6,
        maxWidth: 1024,
        maxHeight: 1024,
        success(compressedFile) {
          resolve(compressedFile);
        },
        error(err) {
          reject(err);
        }
      });
    });
  });

  Promise.all(compressPromises)
    .then(compressedFiles => {
      const imagePromises = compressedFiles.map(file => uploadToCloudinary(file));
      return Promise.all(imagePromises);
    })
    .then(imageUrls => {
      const newCar = {
        brand,
        model,
        bodyType,
        condition,
        location,
        year,
        price,
        mileage,
        description,
        contact,
        images: imageUrls.length > 0 ? imageUrls : ['https://via.placeholder.com/150'],
        seller: currentUser.username,
        rating: 0,
        ratingCount: 0
      };

      push(ref(database, 'cars'), newCar)
        .then(() => {
          alert('Авто успішно додано!');
          closeAddCarModal();
        })
        .catch(error => {
          console.error('Помилка додавання авто:', error);
          alert('Помилка: ' + error.message);
        });
    })
    .catch(error => {
      console.error('Помилка обробки зображень:', error);
      alert('Помилка обробки зображень: ' + error.message);
    });
});

// Обробка редагування авто
document.getElementById('editCarForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const carId = document.getElementById('editCarId').value;
  const brand = document.getElementById('editBrand').value;
  const model = document.getElementById('editModel').value;
  const bodyType = document.getElementById('editBodyType').value;
  const condition = document.getElementById('editCondition').value;
  const location = document.getElementById('editLocation').value;
  const year = parseInt(document.getElementById('editYear').value);
  const price = parseInt(document.getElementById('editPrice').value);
  const mileage = parseInt(document.getElementById('editMileage').value);
  const description = document.getElementById('editDescription').value;
  const contact = document.getElementById('editContact').value;
  const imagesInput = document.getElementById('editImages');

  const car = cars.find(c => c.id === carId);
  const existingImages = car.images;

  const newImageFiles = Array.from(imagesInput.files);
  const compressPromises = newImageFiles.map(file => {
    return new Promise((resolve, reject) => {
      new Compressor(file, {
        quality: 0.6,
        maxWidth: 1024,
        maxHeight: 1024,
        success(compressedFile) {
          resolve(compressedFile);
        },
        error(err) {
          reject(err);
        }
      });
    });
  });

  Promise.all(compressPromises)
    .then(compressedFiles => {
      const imagePromises = compressedFiles.map(file => uploadToCloudinary(file));
      return Promise.all(imagePromises);
    })
    .then(newImageUrls => {
      const updatedImages = [...existingImages, ...newImageUrls];
      const updatedCar = {
        brand,
        model,
        bodyType,
        condition,
        location,
        year,
        price,
        mileage,
        description,
        contact,
        images: updatedImages.length > 0 ? updatedImages : existingImages,
        seller: car.seller,
        rating: car.rating,
        ratingCount: car.ratingCount
      };

      update(ref(database, `cars/${carId}`), updatedCar)
        .then(() => {
          alert('Авто успішно відредаговано!');
          closeEditCarModal();
        })
        .catch(error => {
          console.error('Помилка редагування авто:', error);
          alert('Помилка: ' + error.message);
        });
    })
    .catch(error => {
      console.error('Помилка обробки зображень:', error);
      alert('Помилка обробки зображень: ' + error.message);
    });
});

// Обробка надсилання повідомлення
document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const carId = document.getElementById('messageCarId').value;
  const recipient = document.getElementById('messageRecipient').value;
  const messageText = document.getElementById('messageText').value;

  if (currentUser.username === recipient) {
    alert('Ви не можете надіслати повідомлення самому собі!');
    return;
  }

  const message = {
    sender: currentUser.username,
    recipient: recipient,
    carId: carId || null,
    text: messageText,
    timestamp: new Date().toLocaleString('uk-UA'),
    read: false // Додаємо поле read
  };

  const messagesRef = ref(database, 'messages');
  push(messagesRef, message)
    .then(() => {
      let notificationMessage = `Нове повідомлення від ${currentUser.username}`;
      if (carId) {
        const car = cars.find(c => c.id === carId);
        if (car) {
          notificationMessage += ` щодо ${car.brand} ${car.model}`;
        }
      }
      const notification = {
        recipient: recipient,
        message: notificationMessage,
        timestamp: new Date().toLocaleString('uk-UA'),
        read: false
      };
      push(ref(database, 'notifications'), notification);
      alert('Повідомлення надіслано!');
      displayConversationHistory(recipient);
      document.getElementById('messageText').value = '';
    })
    .catch(error => {
      console.error('Помилка надсилання повідомлення:', error);
      alert('Помилка: ' + error.message);
    });
});

// Фільтрація авто
function filterCars(page) {
  currentPage = page;
  const search = document.getElementById('searchInput').value.toLowerCase();
  const brand = document.getElementById('brandFilter').value;
  const bodyType = document.getElementById('bodyTypeFilter').value;
  const condition = document.getElementById('conditionFilter').value;
  const location = document.getElementById('locationFilter').value.toLowerCase();
  const price = parseInt(document.getElementById('priceFilter').value) || Infinity;
  const mileage = parseInt(document.getElementById('mileageFilter').value) || Infinity;
  const yearFrom = parseInt(document.getElementById('yearFromFilter').value) || 1900;
  const yearTo = parseInt(document.getElementById('yearToFilter').value) || 2025;
  const sort = document.getElementById('sortFilter').value;

  filteredCars = cars.filter(car => {
    const matchesSearch = car.brand.toLowerCase().includes(search) || car.model.toLowerCase().includes(search);
    const matchesBrand = !brand || car.brand === brand;
    const matchesBodyType = !bodyType || car.bodyType === bodyType;
    const matchesCondition = !condition || car.condition === condition;
    const matchesLocation = !location || car.location.toLowerCase().includes(location);
    const matchesPrice = car.price <= price;
    const matchesMileage = car.mileage <= mileage;
    const matchesYear = car.year >= yearFrom && car.year <= yearTo;

    return matchesSearch && matchesBrand && matchesBodyType && matchesCondition && matchesLocation && matchesPrice && matchesMileage && matchesYear;
  });

  if (sort) {
    filteredCars.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'year-asc') return a.year - b.year;
      if (sort === 'year-desc') return b.year - a.year;
      return 0;
    });
  }

  displayCars();
  displayPagination();
}

// Відображення авто
function displayCars() {
  const carList = document.getElementById('carList');
  carList.innerHTML = '';

  const start = (currentPage - 1) * carsPerPage;
  const end = start + carsPerPage;
  const paginatedCars = filteredCars.slice(start, end);

  paginatedCars.forEach(car => {
    const carElement = document.createElement('div');
    carElement.classList.add('car-item');
    const averageRating = car.ratingCount > 0 ? (car.rating / car.ratingCount).toFixed(1) : 'Немає';
    const isFavorite = currentUser && favorites[currentUser.uid] && favorites[currentUser.uid].includes(car.id);
    const isInCompare = currentUser && compareList[currentUser.uid] && compareList[currentUser.uid].includes(car.id);
    carElement.innerHTML = `
      <img src="${car.images[0]}" alt="${car.brand} ${car.model}">
      <h3>${car.brand} ${car.model}</h3>
      <p>Ціна: $${car.price}</p>
      <p>Рік: ${car.year}</p>
      <p>Пробіг: ${car.mileage} км</p>
      <p>Місто: ${car.location}</p>
      <p>Оцінка: ${averageRating}</p>
      <a href="car-details.html?id=${car.id}"><button>Деталі</button></a>
      <button onclick="toggleFavorite('${car.id}')">${isFavorite ? '★ Видалити з обраного' : '☆ Додати до обраного'}</button>
      <button onclick="toggleCompare('${car.id}')">${isInCompare ? 'Видалити з порівняння' : 'Додати до порівняння'}</button>
      ${currentUser && car.seller === currentUser.username ? `
        <button onclick="showEditCarModal('${car.id}')">Редагувати</button>
        <button onclick="deleteCar('${car.id}')">Видалити</button>
      ` : ''}
    `;
    carList.appendChild(carElement);
  });
}

// Відображення пагінації
function displayPagination() {
  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';
  const pageCount = Math.ceil(filteredCars.length / carsPerPage);

  for (let i = 1; i <= pageCount; i++) {
    const button = document.createElement('button');
    button.innerText = i;
    button.classList.add('page-btn');
    if (i === currentPage) button.classList.add('active');
    button.onclick = () => filterCars(i);
    pagination.appendChild(button);
  }
}

// Додавання до обраного
function toggleFavorite(carId) {
  if (!currentUser) {
    alert('Увійдіть, щоб додавати авто до обраного!');
    showLoginModal();
    return;
  }

  const userFavorites = favorites[currentUser.uid] || [];
  const index = userFavorites.indexOf(carId);
  if (index === -1) {
    userFavorites.push(carId);
    const car = cars.find(c => c.id === carId);
    logEvent(analytics, 'add_to_favorites', {
      car_id: carId,
      car_brand: car.brand,
      car_model: car.model,
      user_id: currentUser.uid
    });
    const notification = {
      recipient: currentUser.username,
      message: `Нове авто додано до обраного: ${car.brand} ${car.model}`,
      timestamp: new Date().toLocaleString('uk-UA'),
      read: false
    };
    push(ref(database, 'notifications'), notification);
  } else {
    userFavorites.splice(index, 1);
    logEvent(analytics, 'remove_from_favorites', {
      car_id: carId,
      user_id: currentUser.uid
    });
  }

  set(ref(database, `favorites/${currentUser.uid}`), userFavorites);
}

// Додавання до порівняння
function toggleCompare(carId) {
  if (!currentUser) {
    alert('Увійдіть, щоб додавати авто до порівняння!');
    showLoginModal();
    return;
  }

  const userCompareList = compareList[currentUser.uid] || [];
  const index = userCompareList.indexOf(carId);
  if (index === -1) {
    if (userCompareList.length >= 4) {
      alert('Ви можете порівнювати не більше 4 авто одночасно!');
      return;
    }
    userCompareList.push(carId);
  } else {
    userCompareList.splice(index, 1);
  }

  set(ref(database, `compareList/${currentUser.uid}`), userCompareList);
}

// Видалення авто
function deleteCar(carId) {
  if (!currentUser) {
    alert('Увійдіть, щоб видалити авто!');
    showLoginModal();
    return;
  }

  const car = cars.find(c => c.id === carId);
  if (car && car.seller === currentUser.username) {
    if (confirm('Ви впевнені, що хочете видалити це авто?')) {
      remove(ref(database, `cars/${carId}`))
        .then(() => {
          alert('Авто успішно видалено!');
          loadCars();
        })
        .catch(error => {
          console.error('Помилка видалення авто:', error);
          alert('Помилка: ' + error.message);
        });
    }
  } else {
    alert('Ви можете видаляти лише свої оголошення!');
  }
}

// Відображення обраних авто
function displayFavorites() {
  const favoritesList = document.getElementById('favoritesList');
  favoritesList.innerHTML = '';

  if (!currentUser || !favorites[currentUser.uid] || favorites[currentUser.uid].length === 0) {
    favoritesList.innerHTML = '<p>У вас немає обраних авто.</p>';
    return;
  }

  const favoriteCars = cars.filter(car => favorites[currentUser.uid].includes(car.id));
  favoriteCars.forEach(car => {
    const carElement = document.createElement('div');
    carElement.classList.add('car-item');
    const averageRating = car.ratingCount > 0 ? (car.rating / car.ratingCount).toFixed(1) : 'Немає';
    carElement.innerHTML = `
      <img src="${car.images[0]}" alt="${car.brand} ${car.model}">
      <h3>${car.brand} ${car.model}</h3>
      <p>Ціна: $${car.price}</p>
      <p>Рік: ${car.year}</p>
      <p>Пробіг: ${car.mileage} км</p>
      <p>Місто: ${car.location}</p>
      <p>Оцінка: ${averageRating}</p>
      <a href="car-details.html?id=${car.id}"><button>Деталі</button></a>
      <button onclick="toggleFavorite('${car.id}')">★ Видалити з обраного</button>
    `;
    favoritesList.appendChild(carElement);
  });
}

// Відображення списку порівняння
function displayCompareList() {
  const compareTable = document.getElementById('compareTable');
  const thead = compareTable.querySelector('thead tr');
  const tbody = compareTable.querySelector('tbody');
  const rows = tbody.getElementsByTagName('tr');

  while (thead.children.length > 1) {
    thead.removeChild(thead.lastChild);
  }

  for (let i = 0; i < rows.length; i++) {
    while (rows[i].children.length > 1) {
      rows[i].removeChild(rows[i].lastChild);
    }
  }

  if (!currentUser || !compareList[currentUser.uid] || compareList[currentUser.uid].length === 0) {
    thead.innerHTML = '<th>Характеристика</th>';
    rows[0].innerHTML = '<td>Марка та модель</td>';
    rows[1].innerHTML = '<td>Тип кузова</td>';
    rows[2].innerHTML = '<td>Рік</td>';
    rows[3].innerHTML = '<td>Ціна</td>';
    rows[4].innerHTML = '<td>Пробіг</td>';
    rows[5].innerHTML = '<td>Місто</td>';
    rows[6].innerHTML = '<td>Стан</td>';
    rows[7].innerHTML = '<td>Дії</td>';
    return;
  }

  const compareCars = cars.filter(car => compareList[currentUser.uid].includes(car.id));
  compareCars.forEach(car => {
    const th = document.createElement('th');
    th.innerHTML = `<img src="${car.images[0]}" alt="${car.brand} ${car.model}" style="width: 100px; height: auto;">`;
    thead.appendChild(th);

    rows[0].innerHTML += `<td>${car.brand} ${car.model}</td>`;
    rows[1].innerHTML += `<td>${car.bodyType}</td>`;
    rows[2].innerHTML += `<td>${car.year}</td>`;
    rows[3].innerHTML += `<td>$${car.price}</td>`;
    rows[4].innerHTML += `<td>${car.mileage} км</td>`;
    rows[5].innerHTML += `<td>${car.location}</td>`;
    rows[6].innerHTML += `<td>${car.condition}</td>`;
    rows[7].innerHTML += `<td><button onclick="toggleCompare('${car.id}')">Видалити</button></td>`;
  });
}

// Відображення повідомлень
function displayMessages() {
  const messagesList = document.getElementById('messagesList');
  messagesList.innerHTML = '';

  if (!currentUser) {
    messagesList.innerHTML = '<p>Увійдіть, щоб переглянути повідомлення.</p>';
    return;
  }

  if (!messages || messages.length === 0) {
    messagesList.innerHTML = '<p>Немає повідомлень.</p>';
    return;
  }

  const userMessages = {};
  for (const message of messages) {
    const senderLower = message.sender.toLowerCase();
    const recipientLower = message.recipient.toLowerCase();
    const currentUserLower = currentUser.username.toLowerCase();

    if (senderLower === currentUserLower || recipientLower === currentUserLower) {
      const otherUser = senderLower === currentUserLower ? message.recipient : message.sender;
      const otherUserLower = otherUser.toLowerCase();
      if (!userMessages[otherUserLower]) {
        userMessages[otherUserLower] = { displayName: otherUser, messages: [] };
      }
      userMessages[otherUserLower].messages.push(message);
    }
  }

  if (Object.keys(userMessages).length === 0) {
    messagesList.innerHTML = '<p>Немає повідомлень.</p>';
    return;
  }

  // Відображаємо лише унікальних користувачів
  const displayedUsers = new Set();
  for (const otherUserLower in userMessages) {
    const { displayName, messages: userConversation } = userMessages[otherUserLower];
    if (displayedUsers.has(otherUserLower)) continue;
    displayedUsers.add(otherUserLower);

    // Знаходимо останнє повідомлення, яке має carId (якщо є)
    const messageWithCar = userConversation.find(msg => msg.carId);
    let carInfo = '';
    if (messageWithCar && messageWithCar.carId) {
      const car = cars.find(c => c.id === messageWithCar.carId);
      if (car) {
        carInfo = ` щодо ${car.brand} ${car.model}`;
      }
    }

    // Перевіряємо, чи є непрочитані повідомлення від цього користувача
    const hasUnread = userConversation.some(
      msg => msg.sender === displayName && msg.recipient === currentUser.username && !msg.read
    );

    const div = document.createElement('div');
    div.className = 'message-item';
    if (hasUnread) {
      div.classList.add('unread');
    }
    div.innerHTML = `
      <p>Листування з ${displayName}${carInfo}</p>
      <button onclick="openConversation('${displayName}')">Відкрити</button>
    `;
    messagesList.appendChild(div);
  }
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

// Відкриття листування
function openConversation(recipient) {
  if (!currentUser) {
    alert('Увійдіть, щоб переглянути чат.');
    return;
  }

  // Позначимо всі повідомлення від цього відправника як прочитані
  const messagesToUpdate = messages.filter(
    msg => msg.sender === recipient && msg.recipient === currentUser.username && !msg.read
  );

  const updates = {};
  messagesToUpdate.forEach(msg => {
    updates[`messages/${msg.id}/read`] = true;
  });

  if (Object.keys(updates).length > 0) {
    update(ref(database), updates)
      .then(() => {
        // Оновлюємо локальний масив messages
        messagesToUpdate.forEach(msg => {
          const messageIndex = messages.findIndex(m => m.id === msg.id);
          if (messageIndex !== -1) {
            messages[messageIndex].read = true;
          }
        });
        displayMessages(); // Оновлюємо список чатів
      })
      .catch(error => {
        console.error('Помилка позначення повідомлень як прочитаних:', error);
        alert('Помилка: ' + error.message);
      });
  }

  // Встановлюємо recipient у форму
  document.getElementById('messageRecipient').value = recipient;
  // Очищаємо carId, якщо він не потрібен
  document.getElementById('messageCarId').value = '';
  // Відображаємо історію листування
  displayConversationHistory(recipient);
  // Відкриваємо модальне вікно
  document.getElementById('messageModal').style.display = 'block';
}

// Відображення сповіщень
function displayNotifications() {
  const notificationsList = document.getElementById('notificationsList');
  notificationsList.innerHTML = '';

  if (!currentUser) {
    notificationsList.innerHTML = '<p>Увійдіть, щоб переглянути сповіщення.</p>';
    return;
  }

  const userNotifications = notifications.filter(n => n.recipient === currentUser.username);
  userNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (userNotifications.length === 0) {
    notificationsList.innerHTML = '<p>Немає сповіщень.</p>';
    return;
  }

  userNotifications.forEach(notification => {
    const notificationDiv = document.createElement('div');
    notificationDiv.classList.add('notification');
    notificationDiv.innerHTML = `
      <p>${notification.message}</p>
      <p><small>${notification.timestamp}</small></p>
    `;
    notificationsList.appendChild(notificationDiv);
  });
}

// Позначення сповіщення як прочитане
function markNotificationAsRead(notificationId, index) {
  update(ref(database, `notifications/${notificationId}`), { read: true })
    .then(() => {
      notifications[index].read = true;
      updateNotificationCount();
      displayNotifications();
    })
    .catch(error => {
      console.error('Помилка позначення сповіщення як прочитане:', error);
      alert('Помилка: ' + error.message);
    });
}

// Відображення профілю
function displayProfile() {
  if (!currentUser) {
    document.getElementById('profileSection').innerHTML = '<p>Увійдіть, щоб переглянути профіль.</p>';
    return;
  }

  document.getElementById('profileUsername').innerText = currentUser.username;
  document.getElementById('profileName').innerText = currentUser.name;
  document.getElementById('profilePhone').innerText = currentUser.phone;
  document.getElementById('profileEmail').innerText = currentUser.email;
}

// Редагування профілю
function toggleEditProfile() {
  const editName = document.getElementById('editName');
  const editPhone = document.getElementById('editPhone');
  const editEmail = document.getElementById('editEmail');
  const editBtn = document.getElementById('editProfileBtn');
  const saveBtn = document.getElementById('saveProfileBtn');

  editName.style.display = 'inline';
  editPhone.style.display = 'inline';
  editEmail.style.display = 'inline';
  editName.value = currentUser.name;
  editPhone.value = currentUser.phone;
  editEmail.value = currentUser.email;
  editBtn.style.display = 'none';
  saveBtn.style.display = 'inline';
}

function saveProfile() {
  const newName = document.getElementById('editName').value;
  const newPhone = document.getElementById('editPhone').value;
  const newEmail = document.getElementById('editEmail').value;

  update(ref(database, `users/${currentUser.uid}`), {
    name: newName,
    phone: newPhone,
    email: newEmail
  })
    .then(() => {
      currentUser.name = newName;
      currentUser.phone = newPhone;
      currentUser.email = newEmail;
      displayProfile();
      document.getElementById('editName').style.display = 'none';
      document.getElementById('editPhone').style.display = 'none';
      document.getElementById('editEmail').style.display = 'none';
      document.getElementById('editProfileBtn').style.display = 'inline';
      document.getElementById('saveProfileBtn').style.display = 'none';
      alert('Профіль успішно оновлено!');
    })
    .catch(error => {
      console.error('Помилка оновлення профілю:', error);
      alert('Помилка: ' + error.message);
    });
}

// Перемикання вкладок
function showTab(tabId) {
  const tabs = document.getElementsByClassName('tab-content');
  const tabButtons = document.getElementsByClassName('tab-btn');

  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
  }
  for (let i = 0; i < tabButtons.length; i++) {
    tabButtons[i].classList.remove('active');
  }

  document.getElementById(tabId).classList.add('active');
  const activeButton = Array.from(tabButtons).find(btn => btn.onclick.toString().includes(tabId));
  if (activeButton) activeButton.classList.add('active');
}

// Отримання геолокації
function getGeoLocation(isEdit = false) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(response => response.json())
          .then(data => {
            const location = data.address.city || data.address.town || data.address.village || 'Невідоме місце';
            if (isEdit) {
              document.getElementById('editLocation').value = location;
            } else {
              document.getElementById('newLocation').value = location;
            }
          })
          .catch(error => {
            console.error('Помилка отримання назви місця:', error);
            alert('Не вдалося визначити місце. Введіть вручну.');
          });
      },
      error => {
        console.error('Помилка геолокації:', error);
        alert('Не вдалося отримати геолокацію. Введіть місце вручну.');
      }
    );
  } else {
    alert('Геолокація не підтримується вашим браузером.');
  }
}

// Завантаження фільтрів
function loadFilters() {
  // Фільтри уже завантажені в HTML
}

// Зробимо функції глобальними
window.showLoginModal = showLoginModal;
window.closeLoginModal = closeLoginModal;
window.showRegisterModal = showRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.showResetPasswordModal = showResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.showMessageModal = showMessageModal;
window.closeMessageModal = closeMessageModal;
window.showNotifications = showNotifications;
window.closeNotifications = closeNotifications;
window.showAddCarForm = showAddCarForm;
window.closeAddCarModal = closeAddCarModal;
window.showEditCarModal = showEditCarModal;
window.closeEditCarModal = closeEditCarModal;
window.showFullscreenImage = showFullscreenImage;
window.closeFullscreenImageModal = closeFullscreenImageModal;
window.changeFullscreenImage = changeFullscreenImage;
window.filterCars = filterCars;
window.toggleFavorite = toggleFavorite;
window.toggleCompare = toggleCompare;
window.deleteCar = deleteCar;
window.showTab = showTab;
window.openConversation = openConversation;
window.toggleEditProfile = toggleEditProfile;
window.saveProfile = saveProfile;
window.getGeoLocation = getGeoLocation;
package boltdb

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"

	jsoniter "github.com/json-iterator/go"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

var encryptedStringTooShort = fmt.Errorf("encrypted string too short")

// MarshalObject encodes an object to binary format
func (connection *DbConnection) MarshalObject(object interface{}) ([]byte, error) {
	data, err := json.Marshal(object)
	if err != nil {
		logrus.WithError(err).Errorf("failed marshaling object")
		return data, err
	}
	if connection.getEncryptionKey() == "" {
		logrus.Infof("no encryption passphrase")
		return data, nil
	}
	return encrypt(data, connection.getEncryptionKey())
}

// UnmarshalObject decodes an object from binary data
func (connection *DbConnection) UnmarshalObject(data []byte, object interface{}) error {
	var err error
	if connection.getEncryptionKey() == "" {
		logrus.Infof("no encryption passphrase")
	} else {
		data, err = decrypt(data, connection.getEncryptionKey())
		if err != nil {
			logrus.WithError(err).Errorf("failed decrypting object")
		}
	}
	e := json.Unmarshal(data, object)
	if e != nil {
		return errors.Wrap(err, e.Error())
	}
	return err
}

// UnmarshalObjectWithJsoniter decodes an object from binary data
// using the jsoniter library. It is mainly used to accelerate environment(endpoint)
// decoding at the moment.
func (connection *DbConnection) UnmarshalObjectWithJsoniter(data []byte, object interface{}) error {
	if connection.getEncryptionKey() == "" {
		logrus.Infof("no encryption passphrase")
	} else {
		var err error
		data, err = decrypt(data, connection.getEncryptionKey())
		if err != nil {
			logrus.WithError(err).Errorf("failed decrypting object")
			return err
		}
	}
	var jsoni = jsoniter.ConfigCompatibleWithStandardLibrary
	return jsoni.Unmarshal(data, &object)
}

// mmm, don't have a KMS .... aes GCM seems the most likely from
// https://gist.github.com/atoponce/07d8d4c833873be2f68c34f9afc5a78a#symmetric-encryption

func encrypt(plaintext []byte, passphrase string) (encrypted []byte, err error) {
	logrus.Infof("encrypt")
	block, _ := aes.NewCipher([]byte(passphrase))
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return encrypted, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return encrypted, err
	}
	ciphertextByte := gcm.Seal(
		nonce,
		nonce,
		plaintext,
		nil)
	return ciphertextByte, nil
}

// On error, return the original byte array - it might be unencrypted...
func decrypt(encrypted []byte, passphrase string) (plaintextByte []byte, err error) {
	if string(encrypted) == "false" {
		return []byte("false"), nil
	}
	passphraseByte := []byte(passphrase)
	block, err := aes.NewCipher(passphraseByte)
	if err != nil {
		logrus.Infof("Error creating cypher block: %s", err.Error())
		return encrypted, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		logrus.Infof("Error creating GCM: %s", err.Error())
		return encrypted, err
	}

	nonceSize := gcm.NonceSize()
	if len(encrypted) < nonceSize {
		return encrypted, encryptedStringTooShort
	}

	nonce, ciphertextByteClean := encrypted[:nonceSize], encrypted[nonceSize:]
	plaintextByte, err = gcm.Open(
		nil,
		nonce,
		ciphertextByteClean,
		nil)
	if err != nil {
		logrus.Infof("Error decrypting text: %s", err.Error())
		return encrypted, err
	}
	
	logrus.Infof("decrypted successfully")
	return plaintextByte, err
}
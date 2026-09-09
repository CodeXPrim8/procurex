import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface ProductCardProps {
  product: {
    id: number
    name: string
    sku: string
    category: string
    price: number
    stock: number
    specifications?: Record<string, any>
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  const price = (product.price / 100).toFixed(2)

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.sku}>SKU: {product.sku} | {product.category}</Text>
      
      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <View style={styles.specs}>
          {Object.entries(product.specifications).slice(0, 3).map(([key, value]) => (
            <Text key={key} style={styles.spec}>
              <Text style={styles.specKey}>{key}:</Text> {String(value)}
            </Text>
          ))}
        </View>
      )}
      
      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <Ionicons name="cash" size={16} color="#10b981" />
          <Text style={styles.price}>${price}</Text>
        </View>
        <View style={styles.stockContainer}>
          <Ionicons name="checkmark-circle" size={16} color="#3b82f6" />
          <Text style={styles.stock}>In Stock: {product.stock}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  sku: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  specs: {
    marginBottom: 8,
  },
  spec: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  specKey: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10b981',
    marginLeft: 4,
  },
  stockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stock: {
    fontSize: 12,
    color: '#3b82f6',
    marginLeft: 4,
  },
})



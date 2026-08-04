import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { AUTH_COPY } from '../auth.copy';

interface ConsentItemProps {
  label: string;
  isRequired: boolean;
  isChecked: boolean;
  /** 마케팅 항목의 수신 내용 한 줄 고지(auth-uiux.md 4.3) */
  description: string | null;
  onToggle: () => void;
  onViewPress: () => void;
}

export default function ConsentItem({
  label,
  isRequired,
  isChecked,
  description,
  onToggle,
  onViewPress,
}: ConsentItemProps) {
  const tag = isRequired ? AUTH_COPY.consent.requiredTag : AUTH_COPY.consent.optionalTag;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.checkArea}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
        accessibilityLabel={`${label} ${tag}`}
      >
        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
          {isChecked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <View style={styles.labelArea}>
          <Text style={styles.label}>
            {label} <Text style={styles.tag}>{tag}</Text>
          </Text>
          {description !== null ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.viewButton}
        onPress={onViewPress}
        hitSlop={theme.spacing.sm}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${AUTH_COPY.consent.view}`}
      >
        <Text style={styles.viewLabel}>{AUTH_COPY.consent.view}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  checkArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  checkboxChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  checkMark: {
    color: theme.color.onPrimary,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
  },
  labelArea: {
    flex: 1,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  tag: {
    color: theme.color.textSecondary,
    fontSize: theme.font.size.sm,
  },
  description: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  viewButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingLeft: theme.spacing.sm,
  },
  viewLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
});
